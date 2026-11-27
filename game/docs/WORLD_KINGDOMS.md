# Five crowns and ten provinces

**Status:** implemented in 3.69.0 (roadmap 4.0.1)
**Data:** `js/world/world-regions.js`
**Simulation:** `js/systems/world-map.js`
**Panel:** WORLD tab in Realm Management
**Save schema:** 15 (the `worldMap` block is internally version 2)

## What the player gets

The world beyond the realm is no longer only four abstract compass regions. It
is a saved political map of **ten provinces held by five crowns**: the player's
crown and the four diplomatic realms that already existed in `diplomacy.js`.

| Crown | Provinces | Base resources |
| --- | --- | --- |
| The Crown | Crown Heartland, Crown March | food, wood |
| Northmere Guild | Northmere Pines, Northmere Fen | wood, food |
| Ironvale Caravans | Ironvale Crags, Ironvale Pass | stone |
| Goldcoast League | Goldcoast Vines, Goldcoast Harbor | food, gold |
| Redpass Companies | Redpass Gorge, Redpass Steppe | stone, food |

Every province has an owner, control, loyalty, garrison, border list, terrain,
description and a yearly resource yield. The WORLD panel shows the five crowns,
the province cards and the province polygons over the existing schematic map.
The map still uses the real settlement seats and trade routes; no second map
renderer or second economy was added.

## How the province layer runs

The layer is stored inside the existing `state.worldMap` and settles in the
existing annual world task, after the settlement grant and before the frontier
survey.

- **Control** moves by a small annual delta. Crown provinces follow morale;
  foreign provinces follow their treaty and relation. Hostile borders and a
  contested province push control down, friendly relations and peace let it
  recover. Control is clamped to 0–100.
- **Loyalty** moves with the same owner context and falls faster while
  contested.
- **Contested** is set when control falls below 38 and cleared above 48. The
  strongest neighbouring foreign owner becomes the challenger. A contested
  province raises the frontier pressure read by the existing frontier cards.
- **Owner change** is possible only at 12 control or below, only across a
  hostile border (war, or a war involving the two owners), and only through a
  deterministic hash of the province id and year. The roll is bounded and does
  not draw from any shared random stream.
- **Crown yield** is paid once per year through the existing `addResource`
  path. Only crown-held provinces pay the player. The yield scales with control
  and loyalty, so a province won at low control pays less until it stabilises.
- **History and totals** use the existing bounded world record: ownership
  changes, claims, province yield and province-change counts are saved.

## Pressing a claim

A province card offers `PRESS CLAIM` when the province borders a crown province,
its owner is not under an alliance or trade pact, relation is below 55 (or the
owner is at war), the year's claim has not been used, and the crown has
**24 gold and 8 food**.

The chance is deterministic and visible before the player commits:

```
28 + (100 - control) * 0.45 + (war ? 18 : 0)
   + adjacentCrownProvinces * 4 - garrison * 4
   + (loyalty < 45 ? 6 : 0)
```

It is clamped to 5–92%. The same `(province, year)` roll decides success, so a
reload cannot reroll the outcome.

- **Success:** the crown takes the province at 30 control and 42 loyalty, the
  former owner loses 14 relation and 10 trust and gains 5 fear, morale rises,
  and the world record names the change.
- **Repulse:** the claim still spends the cost, the province loses 14 control
  and 6 loyalty, and the former owner loses 6 relation and 4 trust.
- **Limit:** one claim per year (`lastRegionClaimYear`), saved with the realm.
  A failed claim does not refund the cost.

## UI contract

- The WORLD tab title is **Kingdoms, provinces, trade routes & frontiers**.
- The summary adds `CROWN PROVINCES` and `PROVINCE YIELD`.
- The map draws one polygon per province, coloured by owner and marked when
  contested; its SVG description names the crowns and their province counts.
- The kingdom strip names each crown, ruler, province count, average control
  and contested count.
- Province cards show owner, terrain, yield, control, loyalty, garrison, border
  count, control meter, contested warning, claim button/chance/reason, the last
  change year and the current yearly yield.
- All values come from the live snapshot; the panel never displays `undefined`
  or `NaN`.

## Provincial charters

Each crown province can hold one of three autonomy tiers: crown rule, chartered
or free province. A charter keeps a larger share of the yearly gold levy in the
province, adds yearly loyalty and softens hostile-border control loss. A loyal
province petitions for the next tier after a three-year interval; granting the
petition costs gold and food, refusing or ignoring it costs loyalty. One
charter decision can be made per year. The full contract, formulas and 3.88.0
evidence are in [PROVINCIAL_CHARTERS.md](PROVINCIAL_CHARTERS.md).

## Save compatibility

Schema 15 still owns the `worldMap` block. Its internal version is now 2:

- a version-1 world map without `regions` is normalized to ten default
  provinces on load; routes, frontiers, history and totals are preserved;
- an unknown or duplicate province is rejected by validation and normalized
  from the catalog;
- an old realm that never had a world map receives the quiet default map;
- `lastRegionClaimYear` and all province fields survive an exact save/load.

## Verification

- `tests/systems/world-map.test.js` covers the 10-province/5-crown snapshot,
  v1-to-v2 migration, claim cost and ownership change, the once-per-year lock,
  alliance/trade/relation/border guards, yearly crown yield and ownership
  bounds, charter levy/loyalty effects, petitions, revocation and the legacy
  save path without charter fields.
- `tests/browser/world-map.mjs` founds a real realm, checks the five kingdom
  cards, ten province polygons, ten province cards, the claim affordance and
  its disabled crown state, saves/reloads and repeats the panel at 390 px with
  no overflow or console errors.
- The deterministic 25-year campaign keeps the world task bounded and green.
