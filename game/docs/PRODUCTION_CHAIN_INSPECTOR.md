# Production-chain inspector

The Stores panel now contains a read-only production-chain register and a
warehouse-profile board. Both are written for a player who can see that grain
exists somewhere but cannot tell why bread, planks or cut stone are not moving.

## What a player sees

- `STORES → PRODUCTION CHAINS` lists five collapsed routes: `Field to loaf`,
  `Forest to frame`, `Quarry to wall`, `Well to hearth` and `Workshop to deed`.
  Opening one shows its ordered stages, for example `GROW GRAIN → MILL FLOUR →
  BAKE BREAD → BREW ALE → STORE & DELIVER`.
- Each stage states the real structure count, ready count, construction sites,
  physical goods in the realm and the declared recipe. A missing structure is
  reported as `NO STRUCTURE`; a waiting carrier appears as `ORDER READY` with
  the exact SUPPLY or HAUL quantity instead of a vague status.
- A carrier button is the same verified manual order used in the Buildings
  register. `SHOW BUILDING` jumps to the first structure in that stage and opens
  its dossier. Neither button moves stock by itself.
- `STORES → WAREHOUSE PROFILES` explains the six profiles, their accepted goods,
  store counts, used and free space, and names up to three goods that physically
  exist but have no accepting free store.
- In `BUILDINGS`, a warehouse dossier includes `Warehouse profile note`. For the
  current profile it states the filter; for other profiles it names the held or
  reserved goods that would block a switch. Changing the select still calls the
  simulation, and a rejected change leaves the store exactly as it was.

## Simulation contract

- `js/presentation/production-chain.js` declares five chains and sixteen
  stages. It reads `RECIPES`, `GOODS`, `WAREHOUSE_PROFILES`,
  `getPhysicalStockMap()`, `getWarehouseSnapshot()` and
  `getBuildingSupplyReason()`. It writes nothing.
- `getManualLogisticsSnapshot()` supplies the order previews. The click path
  remains `placeManualOrder()` → `requestSupply()` / `requestHaul()`, so
  reservations, routes, carrier limits and `lastRejection` stay in the
  simulation.
- A stage shows at most six example structures and four ready orders. A
  forester's zero-batch stewardship recipe and a workshop's unique-item recipe
  are not falsely reported as `Output store is full`.
- `getWarehouseProfileSnapshot()` derives held kinds from physical stock and
  accepting space from each store's live filters. `warehouseProfileHint()` is
  pure: it explains a possible switch without applying it.
- No save field, version bump beyond the release string, random stream,
  production rate, tick work or per-frame loop is added. The panel is computed
  only when the register renders.

## Proofs

- `tests/presentation/production-chain.test.js`: five declared routes, live
  stage status, one-carrier-order bounds, physical stock, missing structures,
  profile counters, stranded goods, switch hints, chain tags and read-only
  repeated reads (**4/4** focused tests).
- `npm run test:production-chain-inspector`: a real Chromium start, HUD and
  workshop check, real warehouse/mill/bakery fixtures, BUILDINGS profile hint,
  a rejected and an accepted profile click, STORES chain navigation, a real
  carrier order from the bread chain, SHOW BUILDING, economy/world/explore/
  biome/lexicon/chronicle navigation, save/load and empty page/console error
  lists.
- Spec coverage includes point `3.5.11`, tied to the new read model and both
  proof files. The full 25-year campaign gate runs unchanged because the
  inspector adds no simulation work.
