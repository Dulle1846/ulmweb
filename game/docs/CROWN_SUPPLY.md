# Crown supply — v3.13.0

**Status:** implemented and verified on the `3.13.0` line, 2026-11-10.
**Core:** `js/systems/crown-supply.js`, `js/systems/settlement.js`, `js/simulation/buildings.js`, `js/systems/military.js`, `js/systems/market.js`; **UI:** `js/presentation/management-ui.js`.

## Why it exists

The five 100-year journeys in v3.12.0 ended in resource dead ends that the player could not break with an actual decision:

- The warlord ended year 101 with 0 food and 1 soldier after white peace in year 71. The garrison had eaten the granary, desertion had eaten the garrison, and there was no way to fund both the army and a reserve.
- The merchant ended with 20 residents and water coverage 0, despite 7,646 gold. Wells required a staffed building within eight tiles; gold alone could not create the missing service.
- The builder and diplomat ended with 15–20 food. A food shortage reduced immigration and morale, which reduced the labour that produced food, which prolonged the shortage.
- All five journeys were capped by the same housing arithmetic: a timber cottage holds four residents, and the available housing stock stopped growth before the realm could grow out of the shortage.

Crown supply turns those dead ends into explicit annual commitments. It is additive to the existing economy, settlement, logistics, diplomacy, research, Endeavour and construction systems. It does not change the thirteen ambitions or the eternal-deed state machine.

## The three player decisions

### 1. Standing grain contract

The economy panel offers three contract levels:

| Level | Reserve target | Crown rate |
| --- | --- | --- |
| I — Village tithe | 120 food, raised by population | 1.25 gold / food |
| II — Regional granary | 240 food, raised by population | 1.20 gold / food |
| III — Royal reserve | 420 food, raised by population | 1.15 gold / food |

The contract fills the reserve from **open, non-war trade partners**. Each annual settlement buys up to the target; partners restock a bounded share of their starting stock in `updateMarket`, so a long campaign cannot drain every route permanently. The contract never spends the garrison's payroll: `60 + 8 × soldiers` gold is reserved before any grain purchase. This is the fiscal link between the army and the granary that v3.12.0 was missing.

### 2. Paid waterworks

Waterworks are a public service, not a realm-wide boolean and not a second well:

| Level | Coverage of occupied homes | Setup | Annual payroll |
| --- | --- | --- | --- |
| I — Water carts | 40% | 35 gold | 18 gold |
| II — Cistern network | 65% | 80 gold | 36 gold |
| III — Aqueduct service | 90% | 140 gold | 58 gold |

`updateServices()` counts covered occupied homes exactly like a well, marks the source as `crown-waterworks`, and stops covering them immediately when the annual payroll cannot be met. The merchant can therefore turn gold into water coverage without finding a legal well tile or a spare well worker; the builder can use wells and waterworks together.

### 3. Stone-house upgrade

A completed timber cottage can be rebuilt in stone from the economy panel:

- Cost: **55 gold**, or **42 gold** when a completed mason is employed.
- Effect: the building's type changes to `TYPE.STONE_HOUSE`; its capacity rises from 4 to 6 permanent places.
- No new footprint, no new building entity, no free food or services. The extra residents consume the same granary and water as everyone else.

The upgrade uses the existing `HOUSING_TIERS` capacity, so household assignment, settlement services, growth and save/load all see the new capacity immediately.

## Supporting repairs

### Farm subsistence share

A farm used to send grain only into the mill → bakery → carrier chain. A realm with active farms and no spare carrier could starve beside a full granary. `produceRecipe` now books a direct household subsistence share from each completed farm, scaled by the same worker efficiency as the grain crop. It is recorded as `farm-subsistence` in the food ledger. This is the production link that makes a farmed realm viable even when the bread chain is short-handed.

### Garrison pay in kind

When the granary holds at least twice the garrison's annual provisions, 40% of the coin payroll is settled in kind. The military ledger records `goldNeedBeforeKind`, `kindPayment` and the reduced `goldNeed`; the soldiers still eat the same provisions. A well-fed garrison no longer deserts solely because the treasury is thin, while an empty granary still triggers the old hardship and desertion rules.

### Market restock

Trade partners replenish a bounded part of their starting stock every market update. The restock is capped near the starting stock and does not bypass war: a partner at war remains closed to the contract and the trade tab.

## Save compatibility

`state.crownSupply` is additive:

```js
{
  version: 1,
  grainLevel: 0,
  grainActiveYear: 0,
  lastGrainYear: 0,
  waterworksLevel: 0,
  waterworksActiveYear: 0,
  lastWaterworksYear: 0,
  lastSettledYear: 0,
  housingUpgrades: 0,
  lastHousingYear: 0,
  lastGrainBought: 0,
  lastGrainCost: 0,
  lastWaterworksCost: 0,
  history: []
}
```

`normalizeCrownSupplyState()` accepts a missing or malformed object, clamps levels to 0–3, drops invalid history entries and keeps only the latest 24 entries. Saves written before v3.13.0 load with all levels at zero and the existing well/farm/housing behaviour intact. The field is included in the save snapshot and restored before the management panel renders.

## UI reachability

The economy panel now includes:

- `data-command="crown-grain"` with `data-value="1|2|3"` and an end-contract control.
- `data-command="crown-water"` with `data-value="1|2|3"` and a close-works control.
- `data-command="crown-housing"` for a stone-house upgrade.
- Live status for the grain target, open routes, waterworks coverage, timber cottages, stone houses and the next cost.

The browser journeys use those buttons through the real economy tab; no journey reaches into a system function to change the realm.

## Verification

### The five dead ends, before and after

All runs used the shipped start screen, management tabs, build menu, trade, diplomacy, military and research; no journey called a system function directly. The before column is the v3.12.0 result from the previous journey record, the after column the final v3.13.0 run, both at year 101.

| Journey | v3.12.0 dead end | What was added | Before | After |
| --- | --- | --- | --- | --- |
| Builder | Ended at the hunger floor with no way to expand housing fast enough | Grain contract, stone-house upgrades, farm subsistence | 43 residents, 15–20 food | **60 residents, 140 food, 70% water, 70% safety, 2 soldiers, 13 works** |
| Warlord | 0 food and 1 soldier after white peace; garrison ate the granary | Payroll reserve, grain contract, pay in kind, stone housing | 28 residents, 0 food, 1 soldier | **46 residents, 55 food, 11 soldiers, 82% water, 73% safety, 14 works** |
| Diplomat | Ended at the hunger floor while the court and alliances ran dry | Grain contract, stone housing, farm subsistence | 43 residents, 15–20 food | **60 residents, 143 food, 70% water, 70% safety, 2 soldiers, 10 works, 4 alliances** |
| Merchant | 20 residents at 0% water despite 7,646 gold; coin could not buy a well | Paid waterworks, stone housing, grain contract | 20 residents, 0% water, 7,646 gold | **42 residents, 71% water, 274 food, 6,552 gold, 15 works** |
| Scholar | Ended at the hunger floor before the late tree was finished | Grain contract, stone housing, farm subsistence | 46 residents, 15–20 food | **76 residents, 107 food, 71% water, 79% safety, 17 technologies, 12 works** |

Each journey finished in year 101 without a game over, with food above zero, positive water and safety coverage, and no page or console error. Desktop 1600 px and narrow 864 px checks showed no horizontal overflow. The final measurements were **2.412–2.504 ms/tick** across the five runs (builder 2.473, warlord 2.504, diplomat 2.412, merchant 2.461, scholar 2.486 over roughly 40,000 ticks each); the reports record the exact wall, simulation and tick times.

### Tests and the deterministic campaign

- Focused `tests/systems/crown-supply.test.js`: **6/6** — old-save defaults, annual contract purchase, payroll reserve, partner restock, waterworks suspension on a failed payroll, and the stone-house capacity gain.
- `npm test`: **711/711**, plus syntax and relative imports for 104 source files and all 189 referenced UI ids.
- Deterministic 100-year campaign: `ok:true`, 40,040 ticks, final year 101, 13/13 ambitions, 3 eternal deeds, no game over, **2.534 ms/tick**. The v3.12.0 baseline was 3.261 ms/tick; the pre-change tree re-measured 3.299 ms/tick on the same host under the same conditions.

The performance number comes from the campaign's mature-realm sample after all 40,040 ticks, not from the opening village. Removing the unused logistics presentation snapshot from `updateLogistics` and the per-booking ledger re-filter in `ensureGoodsBook` accounted for the gain; no simulation cadence was lengthened and no assertion was relaxed.

### Save compatibility

A save written before v3.13.0 has no `crownSupply` field. `ensureCrownSupply()` and `normalizeCrownSupplyState()` supply the zeroed structure on load, so old realms keep their existing well, farm, market and housing behaviour; the new controls simply start unselected. The focused test asserts this path, including the clamping of out-of-range levels and malformed history.
