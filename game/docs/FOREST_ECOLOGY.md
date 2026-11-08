# Laubwälder — 1.2.1 implementation audit

This is the implementation record for **1.2.1 Laubwälder**. The shared source of truth is [`world/forest-ecology.js`](../js/world/forest-ecology.js); the renderer (`presentation/rendering/terrain.js`), resource geography (`systems/resource-geography.js`) and management UI all read the same deterministic stand instead of inventing separate forest descriptions.

The visual baseline is documented in the [terrain visual reference](TERRAIN_VISUAL_REFERENCE.md): [`forest-reference.png`](terrain-reference/forest-reference.png) captures all fifteen formations and [`forest-seasons.png`](terrain-reference/forest-seasons.png) follows one ancient wood through spring, summer, autumn and winter. [`forest-reference.json`](terrain-reference/forest-reference.json) records the exact tiles, species mixes, age, goods and fauna behind every frame. The thirteen close-ups that close the former visual gaps are in [`forest-detail-reference.png`](terrain-reference/forest-detail-reference.png); small motifs carry a review ring, but every frame is a native terrain render from the same realm, not a hand-placed prop.

## Model in one paragraph

A tile gets one deterministic **stand** from its moisture, temperature, height and a small coarse-patch hash. The stand selects a formation (oakwood, beechwood, birch grove, maplewood, chestnut grove, linden/elm stand, mixed wood, alluvial wood, hillside wood, ancient wood, regenerating wood, burn scar, windthrow, diseased stand or cut-over wood), a species mix, an age class, a canopy density, a clearing/edge state, an understorey, ground layers, disturbance, goods and fauna. The renderer turns the same values into trees, saplings, shrubs, ferns, brambles, moss, leaf litter, roots, stones, stumps, logs, fungi, nests, hollows, wildlife herds and ambient insects. Resource geography uses the same formation to set timber capacity and expose a survey; it still keeps its original durable stock arrays, so old saves remain readable. A seasonal gathering ledger consumes the stand's goods, and harvest pressure now feeds back into regrowth and wildlife growth instead of remaining a display-only value. Burn scars, windthrow gaps and diseased patches are no longer frozen decorations: each one carries an age and moves through fresh growth, regeneration, young wood and recovery.

The wildlife layer is no longer one silhouette per tile. [`systems/forest-fauna.js`](../js/systems/forest-fauna.js) keeps a bounded, deterministic metapopulation of real herds. Each herd has a species, a home wood, a population, a carrying capacity, seasonal births and deaths, hunting pressure, periodic migration and occasional dispersal into a neighbouring wood. Hunting removes animals from the selected herd; the resulting pressure is stored on that herd and fades over quiet days. Large mammals and resident birds are simulated; butterflies, beetles, ants, bees and the remaining songbirds stay habitat markers in the renderer.

## Species and formations

| Broadleaf species | Form | Distinctive use |
|---|---|---|
| Oak | spreading, broad crown | heaviest timber, acorns, truffles, bark |
| Beech | dome, smooth pale bark | bright beechwood, beechnuts, mushrooms |
| Birch | airy, white trunk | pioneer groves, sap, heather |
| Maple | round, lobed crown | brilliant autumn colour, syrup |
| Chestnut | spreading, warm lowland | chestnuts, bramble edge, game |
| Linden | tall oval/vase | linden flower, honey, beeswax |
| Elm | tall vase | elm seeds, herbs, rich herb layer |
| Alder | airy, damp | alluvial wood, alder cones, moss |

There are fifteen formations, including the three shade characters requested separately: bright beechwood, dark oakwood and airy birch grove. Alluvial, hillside, ancient, regenerating, burned, windthrow, diseased and cut-over stands are additional distinct states.

## Checklist 1.2.1.1–60

| ID | Item | Status | Implementation and evidence |
|---|---|---|---|
| 1.2.1.1 | Different broadleaf species and forms | Implemented | Eight species in `FOREST_SPECIES`; crown form/aspect, bark, trunk ratio and height differ in `drawBroadleaf`; tests in `tests/world/forest-ecology.test.js`. |
| 1.2.1.2 | Oakwoods | Implemented | `oakwood`, dark broad crowns, acorns/truffles/game. |
| 1.2.1.3 | Beechwoods | Implemented | `beechwood`, pale bark, deep leaf carpet, beechnuts/mushrooms. |
| 1.2.1.4 | Birchwoods | Implemented | `birchwood`, airy canopy, heather and pioneer character. |
| 1.2.1.5 | Maplewoods | Implemented | `maplewood`, strong autumn colour and syrup. |
| 1.2.1.6 | Chestnut, linden and elm stands | Implemented | `chestnut-grove` and `linden-elm`; all three are selectable species with their own goods. |
| 1.2.1.7 | Different heights, trunk widths and crown forms | Implemented | Species height/trunk/crown values; age scale; spreading/vase/oval/airy/dome aspect. |
| 1.2.1.8 | Young, mature and ancient trees | Implemented | `ageClassFor`, `AGE_SCALE` and `pickAgeClass`; young saplings and ancient giants differ in size, roots, hollows and crown. |
| 1.2.1.9 | Dead trees, stumps and fallen giants | Implemented | `drawSnag`, `drawStump`, `drawFallenLog`; rare burned/windthrow/diseased states and old-growth logs. |
| 1.2.1.10 | Different densities and natural gaps | Implemented | Per-stand `density`, `treeChance`, `clearing`, coarse gap fields; gaps are real open tiles, not a texture. |
| 1.2.1.11 | Several vegetation layers | Implemented | Canopy trees, sapling/shrub layer, fern/bramble/heather, moss/litter/root/fungus floor. |
| 1.2.1.12 | Dense closed-canopy sections | Implemented | High-density formations and canopy value reduce light; tree chance and crown lobe overlap close the view. |
| 1.2.1.13 | Light-flooded clearings | Implemented | `clearing` drives `drawForestClearing`, flowers and `drawCanopyLight` sun shafts. |
| 1.2.1.14 | Small natural meadows inside forest | Implemented | Clearing branch draws grass, flowers and edge butterflies instead of canopy. |
| 1.2.1.15 | Young forest regeneration | Implemented | `regenerating` and `cutover` have low density, saplings, pioneer birch and a faster visible regrowth story. |
| 1.2.1.16 | Ferns, brambles and shrubs | Implemented | `drawFern`, `drawBramble`, `drawShrub`, selected by each stand's understorey weights. |
| 1.2.1.17 | Moss-covered ground | Implemented | `ground.moss`, `drawMossPatch`, moss on logs and old roots. |
| 1.2.1.18 | Woodland edges and grassland transitions | Implemented | `edge` increases light, flowers, shrubs and fauna; edge only occurs at low pressure or clearing margins. |
| 1.2.1.19 | Different sightlines and canopy densities | Implemented | `canopy`, `light`, clearing and species crowns; dense/dark oakwood contrasts with airy birch and bright beech. |
| 1.2.1.20 | Natural trails, game paths and open ground | Implemented | Deterministic `trail` field draws deer trails; clearings and cut-over gaps open the canopy. `forest-detail-reference.png` shows a ring-marked trail at (114,24). |
| 1.2.1.21 | Different forest soils and moisture | Implemented | `ground.soil` (`alluvial`, `dry`, `humus`, `loam`) and `humus`/`moss`/`litter` values; floor tint follows them. `forest-detail-reference.png` compares alluvial wet (70% moisture) with well-drained loam (38%). |
| 1.2.1.22 | Fresh and weathered leaf carpets | Implemented | `drawLeafCarpet` mixes fresh green/yellow and weathered brown leaves by season and litter. |
| 1.2.1.23 | Dark humus-rich soils | Implemented | `humus` and `ground.soil` drive the dark forest-floor tint in `drawForestGround`. |
| 1.2.1.24 | Exposed roots, stones and weathered branches | Implemented | `drawRoots`, rock/stones in the floor, fallen branches/logs; ancient trees flare roots. |
| 1.2.1.25 | Fungi on stumps and rotting material | Implemented | `drawMushroomCluster` on stumps, logs and damp floor; mushroom goods are seasonal. |
| 1.2.1.26 | Spring fresh growth and light-green crowns | Implemented | Continuous `foliageState` green-up, flower bloom and sap/syrup/herb availability. |
| 1.2.1.27 | Dense summer green crowns | Implemented | Full leaf state, closed-canopy formations and summer goods (berries, honey, linden flower). |
| 1.2.1.28 | Yellow, orange, red and brown autumn foliage | Implemented | Per-species autumn palettes and fall timing; floor litter and leaf fall follow the turn. |
| 1.2.1.29 | Winter bare branches, leaf litter and snow | Implemented | Bare branch crowns, marcescent oak/beech hold, snow caps, leaf carpet and snow-covered floor. |
| 1.2.1.30 | Different leaf-fall times by species | Implemented | `seasonal-foliage.js` has independent timings for oak, beech, birch, maple, chestnut, linden, elm and alder; tests assert distinct drop starts. |
| 1.2.1.31 | Seasonal flowers and fruit | Implemented | `flowerBloom` drives visible flowers; acorns, beechnuts, chestnuts, berries, linden flower and other fruit descriptors are season-gated. |
| 1.2.1.32 | Deer, roe deer, boar, fox and hare | Implemented (simulated) | `forest-fauna.js` seeds real herds on wooded tiles; births, deaths, hunting pressure, capacity and migration change each herd over time. |
| 1.2.1.33 | Squirrels, mice and small animals | Implemented (simulated) | Squirrel herds are part of the population model; mouse and other small-animal habitat markers remain on the stand survey. |
| 1.2.1.34 | Owls, woodpeckers, songbirds and raptors | Implemented (simulated) | Owl and woodpecker resident populations are simulated; songbirds and raptors remain habitat silhouettes and survey entries. |
| 1.2.1.35 | Insects, beetles, butterflies and ants | Implemented (ambient) | Beetle, butterfly, ant and bee habitat entries and tiny insect marks. |
| 1.2.1.36 | Trails, nests, hollows and feeding places | Implemented | Deer trails, ancient hollows, nests on old trees, mushrooms/berries as feeding grounds. |
| 1.2.1.37 | Seasonal migration and breeding seasons | Implemented (simulated) | Spring reproduction bonus, winter mortality, seasonal capacity and period-based migration between neighbouring woods; dispersal splits crowded herds. |
| 1.2.1.38 | Timber from different broadleaf species | Implemented (ledger) | Per-species timber values; `forest-gathering.js` gathers timber from real forest stock through the Lumber Yard/Forester action. |
| 1.2.1.39 | Firewood and charcoal | Implemented (ledger) | Firewood is always available; charcoal appears in ancient/burned stands. Both draws reduce the real forest stock. |
| 1.2.1.40 | Mushrooms, berries, nuts and wild fruit | Implemented (ledger) | Seasonal mushrooms, berries, acorns, beechnuts and chestnuts are gathered into a bounded ledger; forage does not remove standing timber. |
| 1.2.1.41 | Medicinal plants and herbs | Implemented (ledger) | Seasonal herbs are gathered from alluvial and linden/elm stands into the same ledger. |
| 1.2.1.42 | Wild meat, furs and hides | Implemented (herd + ledger) | `harvestForestGameAt` removes animals from a concrete herd; `game`, `fur` and `hides` carry prime/good/lean bands and can be cured or tanned into processed goods. |
| 1.2.1.43 | Honey and beeswax | Implemented (ledger) | Linden/edge honey and the derived beeswax good; seasonal summer peak and ledger entry. |
| 1.2.1.44 | Acorns and natural fodder | Implemented (pannage) | Acorn/beechnut/chestnut mast is gathered from the wood and can be fed to a real Stable, creating a bounded pannage reserve that is consumed day by day. |
| 1.2.1.45 | Old-growth-like broadleaf woods | Implemented | `ancient` formation, ancient age bias, hollows, deep humus, logs, moss and rich fauna. |
| 1.2.1.46 | Bright beechwoods and dark oakwoods | Implemented | Distinct formations and palettes; beech palette is lighter and oak density/darkness higher. |
| 1.2.1.47 | Airy birch groves | Implemented | Low density, white trunks, heather, light canopy and pioneer goods. |
| 1.2.1.48 | Damp alluvial broadleaf woods | Implemented | `alluvial` formation for wet low ground: alder/elm/birch, ferns, moss, butterflies and herbs. |
| 1.2.1.49 | Hillside and steep mountain broadleaf woods | Implemented | `hillside` formation above the woodland belt: beech/oak/maple, mossy stone, raptors. |
| 1.2.1.50 | Single tree groups in open landscapes | Implemented | Renderer's lone mature tree/grove branch places isolated crowns outside closed forest. |
| 1.2.1.51 | Forest fires and dry burn scars | Implemented (succession) | Rare `burned` formation, charred snags, ash floor, charcoal and open regrowth; a persistent record ages the burn into post-fire regrowth. |
| 1.2.1.52 | Pest infestation and tree disease | Implemented (succession) | `diseased` formation with bare/thin crowns, deadwood and beetle/woodpecker fauna; recovery passes through diseased regrowth and young wood. |
| 1.2.1.53 | Storm damage and uprooted trees | Implemented (succession) | `windthrow` formation, toppled logs, root plates and shattered crowns; the gap closes through post-storm regrowth. |
| 1.2.1.54 | Over-cutting and canopy loss | Implemented | Low stock ratio becomes `cutover`; low canopy, stumps, bramble and pioneer regrowth; resource stock is authoritative. |
| 1.2.1.55 | Soil compaction and over-hunting | Implemented (offtake) | `forestRegrowthFactor` reduces regrowth to 35% at full compaction; `huntingPressure` is created by `harvestForestGameAt` from the share of a herd removed, not from wood stock or edge. |
| 1.2.1.56 | Regeneration after fire, clearing and storm | Implemented (succession) | Burned, windthrow and diseased stands now pass through fresh → regrowth → young → recovering → recovered; `regrowForests` restores stock while the stand returns to its original woodland. |
| 1.2.1.57 | Sunbeams through canopy gaps | Implemented | `drawCanopyLight` screen-blended shafts and warm pool on clearing tiles. |
| 1.2.1.58 | Light ground mist and damp morning mood | Implemented | `drawForestMist` low-alpha drifting floor mist; no separate hour-of-day clock in the renderer. |
| 1.2.1.59 | Wind movement and falling leaves | Implemented | Per-tree sway, animated falling leaf marks, leaf carpet and windthrow debris. |
| 1.2.1.60 | Time- and season-dependent light/colour | Implemented | Continuous seasonal palette/turn/snow curves, lower winter sun and per-stand light/clearing; tick drives wind/light motion. |

## Wildlife population model

- **Bounded metapopulation.** The world holds at most 240 herds (`MAX_HERDS`). A herd lives on one wooded tile and is capped at 135% of its current carrying capacity. The herd list, not the renderer, is the source of truth for wildlife.
- **Deterministic growth.** Each species has a base population, reproduction rate, mortality rate, mobility and migration period. Carrying capacity follows stand preference (edge, clearing, young growth, mushrooms, mast, ancient trees, disease), forest stock and season. Spring raises reproduction, winter lowers it and raises losses, and hunting pressure reduces growth. The daily step is the pure `forestHerdGrowth` helper: crowding reduces gain, mortality removes a fixed share, and each unit of `huntingPressure` adds a 2.5% loss. This isolates over-hunting from the capacity effect in `tests/world/forest-pressure.test.js`.
- **Hunting is a real offtake.** `harvestForestGameAt(x, y, count)` chooses one herd on the tile, removes up to three animals (always leaving at least 0.8), adds `2 × removed share` to that herd's `huntingPressure`, and records the event in the bounded herd history. The quality band is read from the herd's condition before the shot: prime, good or lean. The pressure decays by 1.5% per simulated day.
- **Movement and dispersal.** A herd checks a bounded neighbourhood when its migration period is due or it is crowded, and moves to a better neighbouring wood. A herd above 118% of capacity can split off a satellite herd into an empty neighbouring wood, respecting the 240-herd cap.
- **Persistence.** `state.forestFauna` is saved as optional version-1 data. Old saves without it still load and build herds on first use. Validation rejects malformed versions, herd lists, species, coordinates, populations and capacities.
- **Presentation and survey.** The renderer draws the herd on its home tile; the Lumber Yard and Forester site note reports the herd mix and population through `forestFaunaSummaryAt`. If no herd is present, the older habitat list remains a display fallback.
- **Not modelled.** This is not individual-animal genealogy, a predator-prey kill ledger or a territory polygon engine. Hunting is a herd-level offtake, not a per-animal body-condition or wound model. Insects, butterflies, bees and ants remain ambient markers, and songbirds/raptors remain survey silhouettes rather than simulated populations.

## Temporal disturbance succession

[`systems/forest-succession.js`](../js/systems/forest-succession.js) stores one compact record per disturbed tile: kind (`burned`, `windthrow`, `diseased`) and age in simulation days. The records are built from the same seeded stands the renderer shows and are included in save data as version-1 `forestSuccession` state.

| Disturbance | Fresh | Regrowth | Young wood | Recovering | Recovered |
|---|---:|---:|---:|---:|---:|
| Burn | 0–79 days | 80–179 | 180–359 | 360–519 | 520+ |
| Windthrow | 0–59 | 60–149 | 150–299 | 300–439 | 440+ |
| Disease | 0–99 | 100–219 | 220–419 | 420–599 | 600+ |

- **The stand follows the age, not a second formation list.** A fresh record keeps its existing burn/windthrow/diseased formation. Regrowth and young stages use the existing `regenerating` formation with the disturbance's deadwood/log cues. Recovering returns to the original woodland while retaining the record. A recovered record has no disturbance label and no seeded damage overlay, so the old burn scar cannot silently reappear.
- **New events are rare and real.** Every 140 simulation days one new deterministic disturbance is chosen. It lowers that tile's actual `forestStock` to 35% (burn), 55% (windthrow) or 70% (disease) of its previous value and is recorded in a bounded 24-entry history. The existing `regrowForests` loop then rebuilds stock; compaction still slows that recovery.
- **Recovered sites can be disturbed again.** A recovered record remains as a durable marker until a later event reuses the slot, so saves preserve both the recovery and the absence of the original seeded scar.
- **Presentation and save.** The terrain renderer, resource node, forest fauna stand, gathering ledger and Lumber Yard/Forester site note all receive the same succession lookup. Records advance once per simulation day, capped at 30 days per update so a suspended tab cannot skip an entire stage.

## Forest products ledger

The seasonal gathering ledger lives in [`systems/forest-gathering.js`](../js/systems/forest-gathering.js) and is deliberately local to the wood. It is not a second city currency and adds no HUD bar.

- **Same stand as the renderer.** `forestProductsAt(x, y, day)` re-reads the resource node and `forestStandAt`, so the gather list, season and abundance are the values the player sees on the tile. Timber, firewood and charcoal come from the standing stock; mushrooms, berries, nuts, herbs, honey, beeswax, game, fur and hides are seasonal forage goods.
- **Hunting closes the loop.** A gather that includes game calls `harvestForestGameAt` once and only adds `game`, `fur` and `hides` if a herd was actually present. The returned prime/good/lean band is stored in the ledger's quality map. `PROCESS FOREST HUNT` converts raw game, furs and hides into cured game, tanned furs and cured hides while preserving each unit's band. A Stable can consume gathered mast through `FEED STABLE FROM MAST`; the reserve is stored on the building and decremented by `updateForestPannage`.
- **Harvest has a cost.** Timber, firewood and charcoal reduce the node's real `forestStock`, so gathering feeds depletion, the cut-over formation and the compaction brake. Forage does not remove standing timber, but it is still recorded in the ledger.
- **Bounded and repeatable.** A tile can be gathered once per day, the ledger stock and history are capped, and `gatherNearestForestProducts` lets a Lumber Yard or Forester's Lodge act on the nearest real forest node. The management panel exposes one `GATHER FOREST PRODUCTS` action.
- **Persistent.** `state.forestGathering` is version-1 save data with strict validation and a serialize/restore round trip. Old saves without it load and start with an empty ledger.
- **Tested.** `tests/systems/forest-gathering.test.js` covers seasonality, the same-day cooldown, stock bounds, save round trips and the nearest-node action.

## Long-run audit

A deterministic audit ran three seeds (`20261108`, `7`, `99`) for four calendar years (1,600 daily steps per seed) on a flat 64 × 64 temperate test world with the forest setting at 70 and full forest stock. The measured values below are from the final model, not hand-written targets.

| Metric | Year 1 | Years 2–4 |
|---|---:|---:|
| Herds at year end | 132–148 | 132–148 |
| Population at year end | 483.2–496.2 | 496.3–511.2 |
| Year-end capacity fill | 0.370–0.375 | 0.376–0.382 |
| Migrations per year | 217–230 (initial settling) | 41–76 |
| Splits per year | 10–14 | 0 |
| Maximum herds on one tile | 1 | 1 |
| Duplicate herd IDs | 0 | 0 |

- **Seasonal shape.** Day-300 winter fill was 0.945–0.988 of the reduced winter capacity; the population then lost 33.0–36.0 % by day 350, and the next year-end fill settled at 0.370–0.382. There is no multi-year decline or winter extinction wave.
- **Movement.** After the first settling year, 41–76 migrations per year were enough for regular range shifts without moving every herd every season. Year boundaries no longer interrupt the period check.
- **Dispersal.** Ten to fourteen crowded herds split during the first year, when winter capacity drops under the initial population. Once the population settles below the 118 % split threshold, no further split occurs; the long-run test rejects uncontrolled splitting.
- **Species persistence.** Every species present at world creation was still present after four years. A seed that starts without a species (for example, seed `7` has no squirrel) does not gain one spontaneously; that is a seed-composition difference, not an extinction event.
- **Hunting pressure.** After two years, reducing forest stock to 60 % lowered the stable population from 503.0 to 414.7 (−17.5 %); 30 % stock lowered it to 360.4 (−28.3 %). Capacity fill stayed at 0.356–0.379, so harvest pressure thins the herds without collapsing the metapopulation.

The durable regression is `tests/systems/forest-fauna-longrun.test.js`: three seeds × four years on a 48 × 48 world, daily stacking checks, year-boundary migration, first-year dispersal, bounded populations, species persistence and the 60 %/30 % stock scenarios.

## Deliberate limits

- **Wildlife is simulated at herd level, not per animal.** There is no individual pedigree, predator-prey kill accounting or territory geometry. The herd model is deterministic, saveable and observable through the map and site survey; the ambient insect layer is still decoration.
- **Forest products are a local seasonal ledger, not a second city currency.** The existing wood/food economy and logistics ledger remain authoritative; the forest ledger records what a wood yielded, keeps a bounded stock and history, and reduces real standing timber for wood products. It does not add a parallel treasury or HUD economy.
- **Compaction is a real regrowth brake; over-hunting is a herd-level offtake pressure.** `ground.compaction` derives from harvest stock, trails, edges and cut-over state. `forestRegrowthFactor(stand) = max(0.35, 1 − 0.65 × compaction)` is applied by `regrowForests`, so a compacted wood recovers visibly less stock. `ground.huntingPressure` remains an ecological survey value, but population growth now reads `herd.huntingPressure` created by an actual harvest. Neither is a soil-chemistry or per-animal kill model.
- **Disturbances are deterministic succession states**, not a live fire-spread, wind-field or pathogen physics engine. They age, reduce real stock, reopen for later events and change the rendered formation, but they do not spread across neighbouring tiles or model firefighting/control measures yet.
- **Pannage is a feed reserve, not a livestock breeding simulator.** A Stable consumes real gathered mast and stores horse-days, but the current model does not breed horses, track individual animals or turn the reserve into a separate meat/milk chain.
- **No real-GPU validation.** The committed sheets use Chromium's available WebGL renderer, which is software WebGL in this workspace. They prove the code paths, not target-GPU colour or frame time.

## Checks

```sh
cd game
npm test
npm run test:forest-reference
npm run test:forest-detail
```

`npm test` currently passes **554/554** and covers the 15 formations, determinism, reachable site conditions, all eight species, age classes, disturbances and their temporal succession, seasonal goods, fauna filtering, the herd population/migration/restore tests, real hunting offtake, quality/processing, pannage, forest gathering, compaction, resource-node integration and the seasonal foliage timings. `test:forest-reference` requires Chromium and Playwright; it captures all 15 formations plus a four-season sequence and fails on a missing formation, a page runtime error or a fatal WebGL diagnostic. `test:forest-detail` captures the thirteen native close-ups and writes `forest-detail-reference.png`/`.json`; it waits for the terrain cache to rebuild before each frame, so a slow software renderer cannot silently save the previous view. Set `FOREST_REFERENCE_OUT` or `FOREST_DETAIL_OUT` to redirect the artifacts.
