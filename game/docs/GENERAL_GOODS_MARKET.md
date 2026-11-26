# General goods market

The Trade tab has two ledgers. The upper `ROYAL RESOURCES` rows are the original
`wood`, `stone` and `food` market and keep their existing price pressures,
partner stock loops, diplomatic factors and food-only resource ledger. The
`GENERAL GOODS · PHYSICAL STOCK` rows are a parallel exchange for every key in
`GOOD_KEYS`, including the regional timbers.

## What a player sees

- Each general goods row names the good, its base quote, the partner's stock and
  the realm's current unreserved stored amount.
- `BUY 5` shows the gold actually charged after the partner's terms, court,
  health, faith, justice, research, debt, espionage and hazard factors. The units
  leave the partner and are deposited into a warehouse whose filters accept the
  good. If no store can accept the lot, the quote refuses the purchase instead
  of granting free stock.
- `SELL 5` shows the actual payout and withdraws only goods that are not reserved
  for a carrier job. A partial remainder below one lot can still be sold.
- Both trades are booked in the central goods book with real `deposited` and
  `withdrawn` movements. `getGoodsAudit()` stays balanced; no general good is
  ever minted through `addResource()`.

## Simulation contract

- `MARKET_GOODS` is `GOOD_KEYS` from `city-config.js`. `GOOD_BASE_PRICES` uses the
  shipped base price for timber goods and explicit staples for the ten original
  goods. No base price is written back into the save.
- The saved market carries `prices`, `priceTrend` and `priceHistory` for each
  general good and a `stock` entry on every partner. A legacy save without those
  fields is normalized in place; wood/stone/food prices and stocks are untouched.
- Price updates happen on the existing 90-tick market cadence. General goods use
  the separate `goods-market` random stream, so the original market stream still
  receives exactly three draws per update and seeded results remain reproducible.
- `biome-market-link.js` is unchanged. Frontier readings cover only the three
  royal resources, and stored biome goods still sell at the existing quote in the
  biome panel.
- The sell-only regional timber exchange is unchanged. Its quote comes from
  `state.market.prices.wood` and physical stock; the general market does not add
  a buy path to it or alter its ledger cause.

## Proofs

- `tests/systems/goods-market.test.js`: quote equals execution for every
  `GOOD_KEYS` entry, bounded seeded streams, legacy save normalization, reserved
  stock protection, unaffordable purchase refusal and accepting-capacity checks.
- `tests/systems/market-determinism.test.js` and
  `tests/systems/biome-market-link.test.js` guard the original three-resource
  stream and frontier semantics.
- `npm run test:goods-market-ui`: a real browser start, HUD/workshop check,
  seven management panels, an actual BUY and SELL in the Trade tab, save/load and
  empty page/console error lists.
- The full 25-year campaign gate runs unchanged with the added bounded 90-tick
  general goods pass.
