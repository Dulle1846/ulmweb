# Crown supply — v3.13.1

**Status:** implemented and verified on the `3.13.1` line, 2026-11-10.
**Core:** `js/systems/crown-supply.js`, `js/systems/settlement.js`, `js/simulation/buildings.js`, `js/systems/military.js`, `js/systems/market.js`; **UI:** `js/presentation/management-ui.js`.

## Why v3.13.1 exists

v3.13.0 gave the realm a grain contract, paid waterworks and stone housing, and all five 100-year journeys became viable. One requirement was still not met: the warlord ended with a standing garrison but no durable granary. At year 101 the v3.13.0 realm had **46 residents, 11 soldiers and 55 food**. Its annual demand was **298 food** (46 × 6 + 11 × 2), so the reserve covered **0.18 years**; two years required **596 food**, a measured gap of **541 food**.

The last pre-release run improved the food stock to 239 but still covered only 0.66 years of the then-current 360 food demand — 481 food short of the 720 needed. Moving the annual settlement earlier or globally raising farm yields would have changed the other four journeys and added per-tick cost. v3.13.1 instead extends the existing crown-supply decisions.

## Annual demand

The reserve is measured against the food the realm actually eats in a year, not a flat number:

```text
annual demand = residents × 6
              + soldiers × 2
              + mounted soldiers × 2 extra
```

`getCrownAnnualFoodDemand()` reads the live citizen and garrison entities, so a larger garrison or a larger population automatically raises the target. The UI reports both **ANNUAL DEMAND** and **RESERVE COVERAGE** in years.

## The five grain contracts

| Level | Contract | Target | Crown rate | Delivery |
| --- | --- | --- | --- | --- |
| 0 | No standing contract | — | — | — |
| I | Village tithe | max(120, population × 4 + 60) | 1.25 gold / food | annual |
| II | Regional granary | max(240, population × 4 + 60) | 1.20 gold / food | annual |
| III | Royal reserve | max(420, population × 4 + 60) | 1.15 gold / food | annual |
| IV | Royal war granary | max(420, population × 4 + 60, ceil(annual demand × 2.5)) | 1.10 gold / food | four seasonal shipments |

The war granary is the only tier whose target follows real demand. For the final warlord — 47 residents, 11 soldiers and one mounted soldier — demand is **306** and the target is **765** (2.5 years). The measured final stock was **749.9**, or **2.45 years**, without changing the target of any other tier.

Only level IV settles grain in every season. Levels I–III keep the v3.13.0 annual settlement and target arithmetic, so the builder, diplomat, merchant and scholar journeys do not inherit the warlord's more aggressive purchase schedule. The seasonal call is one bounded `settleCrownSupply()` at each 100-day boundary, not new per-tick work.

## The commissary

The economy panel's `PROVISION THE GRANARY` action is the player's bridge between stored goods and the reserve:

1. **Call in the harvest.** At level IV, `requisitionGranary()` transfers grain already held in farms and warehouses into the royal reserve. This is a movement of existing grain, not a new yield.
2. **Sell surplus goods.** Stone is sold first, then wood, above a **600 / 600** construction reserve. The sale goes through the existing `executeTrade` path and the proceeds buy food at the contract rate.
3. **Barter directly.** When coin or open market grain is exhausted, the commissary accepts **2 wood or 3 stone per food**. The same 600 / 600 reserve applies at levels I–III and outside an emergency.
4. **Emergency draw.** At level IV only, a realm below **one year** of rations may use the last wood and stone (reserve 0) to buy food. This is the explicit hunger-emergency lever, not the normal provisioning path.
5. **Payroll protection.** Grain purchases never spend the **60 + 8 × soldiers** gold reserved for the garrison payroll. The contract can therefore feed the reserve without triggering the desertion spiral that broke the v3.12.0 warlord.

The commissary never creates food. Every unit is bought, bartered, or transferred from an existing store, and every good spent is removed from the construction economy.

## Regional provisioning

The direct barter was extended from the war granary to all active grain levels. A regional realm with ample timber and stone can therefore top up its reserve when the coin route is thin, while keeping its 600 / 600 construction reserve. The 100-year journeys use the same `crown-provision` button through the real economy tab: builder, diplomat and scholar call the commissary at crown turns while coverage is below **1.2 years**, filling the contract target and protecting the late population. Their final coverage is 0.82, 1.15 and 0.77 years respectively. The warlord preserves its goods until the final provisioning because the level IV emergency can use them without a reserve.

## Save compatibility

`state.crownSupply` is additive and now reports schema version **2**:

```js
{
  version: 2,
  grainLevel: 0,          // 0–4
  grainActiveYear: 0,
  lastGrainYear: 0,
  lastGrainSeason: 0,     // added in v3.13.1: year × 4 + season
  waterworksLevel: 0,     // 0–3
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

`normalizeCrownSupplyState()` accepts a missing or malformed object, clamps grain levels to 0–4, adds `lastGrainSeason: 0` for older saves, drops invalid history entries and keeps only the latest 24. Saves written before v3.13.1 load with their existing contract and waterworks levels intact and start the seasonal marker at zero. The thirteen royal ambitions, their order and rewards, and the eternal-deed state machine are unchanged.

## UI reachability

The economy panel exposes:

- `data-command="crown-grain"` with `data-value="1|2|3|4"` and an end-contract control. Level IV is labelled **WAR GRANARY · 2.5Y RATIONS**.
- `data-command="crown-water"` with `data-value="1|2|3"`.
- `data-command="crown-housing"` for the stone-house upgrade.
- `data-command="crown-provision"` for call-in, market sale and direct barter.
- Live **ANNUAL DEMAND**, **RESERVE COVERAGE**, commissary surplus, target, shortfall and route status.

All five journeys use the real start screen, management tabs, build menu, trade, diplomacy, military and research. The browser harness does not call a system function to change the realm.

## Verification

### Three dead-end classes and the measured gap

| Dead end | Found gap before v3.13.1 | Intervention |
| --- | --- | --- |
| Warlord garrison ate the granary | 55 food / 0.18 years at v3.13.0; last pre-release run 239 food / 0.66 years, 481 short of 720 | Level IV war granary at 2.5 × real demand, four seasonal deliveries, harvest call-in, commissary sale and emergency barter |
| Builder, diplomat and scholar ended at the year-end hunger floor | builder 121 vs 140 food; diplomat 119 vs 143; scholar 64 vs 76 residents in the last pre-release run | Regional commissary barter, crown-turn provisioning while coverage is below 1.2 years, existing farm subsistence and stone housing |
| Merchant reached the end with goods but below the coin target | 6,107 vs 6,552 gold in the last pre-release run | Final sale of surplus stone and wood through the existing trade tab, after the last endeavour decision |

### The five journeys, year 101

All five runs used the real UI paths, kept water and safety above zero, and produced no page or console error. The before column is the v3.13.0 release record; the after column is the final v3.13.1 browser run.

| Journey | Dead end / before | v3.13.1 after | Granary reserve | ms/tick |
| --- | --- | --- | --- | --- |
| Builder | 60 residents, 140 food; late-year drain left only 121 in the last pre-release run | **60 residents, 300.6 food, 70% water, 70% safety, 2 soldiers, 13 works** | 300.6 / 366 = **0.82 years** | **2.428** |
| Warlord | 46 residents, 55 food, 11 soldiers, 0.18 years; last pre-release 239 food, 0.66 years | **47 residents, 749.9 food, 11 soldiers, 73% water, 73% safety, 14 works** | 749.9 / 306 = **2.45 years** (target 765) | **2.485** |
| Diplomat | 60 residents, 143 food; last pre-release 119 | **60 residents, 420.1 food, 70% water, 70% safety, 2 soldiers, 10 works, 4 alliances** | 420.1 / 366 = **1.15 years** | **2.354** |
| Merchant | 42 residents, 71% water, 6,552 gold; last pre-release 6,107 | **42 residents, 71% water, 286.4 food, 7,045 gold, 15 works, 240 trades** | 286.4 / 258 = **1.11 years** | **2.226** |
| Scholar | 76 residents, 107 food; last pre-release 64 residents | **89 residents, 416.6 food, 71% water, 82% safety, 17 technologies, 13 works** | 416.6 / 540 = **0.77 years** | **2.468** |

The warlord is the requirement-critical result: **11 soldiers ≥ 8** and **2.45 years ≥ 2 years**. All four other journeys are at or above their v3.13.0 values; the builder, diplomat, merchant and scholar all gained food or coin rather than losing it. The browser runs measured **2.226–2.485 ms/tick**.

### Deterministic campaign

The 100-year campaign is `ok:true`:

- **40,040 ticks**, final year **101**, no game over.
- **13/13** royal ambitions, **3** eternal deeds, `allComplete:true`.
- **2.556 ms/tick** against the pre-change baseline of **3.299 ms/tick** (v3.12.0 release baseline 3.261). The prior v3.13.0 sample was 2.534 ms/tick; this sample is 0.022 ms above that sample and 0.743 ms below the release gate.

### Tests

- Focused `tests/systems/crown-supply.test.js`: **11/11** — defaults, annual purchase, annual regional delivery, four seasonal level IV deliveries, demand-based target, commissary sale, regional barter, payroll reserve, partner restock, waterworks suspension and stone capacity.
- `npm test`: **716/716**, plus syntax and relative imports for **104** source files and **189** referenced UI ids.
- Old-save path: a state without `crownSupply` receives version 2 defaults, `lastGrainSeason: 0`, and no change to existing well, farm, market or housing behaviour.
