# Laubwälder — 1.2.1 implementation audit

This is the implementation record for **1.2.1 Laubwälder**. The shared source of truth is [`world/forest-ecology.js`](../js/world/forest-ecology.js); the renderer (`presentation/rendering/terrain.js`), resource geography (`systems/resource-geography.js`) and management UI all read the same deterministic stand instead of inventing separate forest descriptions.

The visual baseline is documented in the [terrain visual reference](TERRAIN_VISUAL_REFERENCE.md): [`forest-reference.png`](terrain-reference/forest-reference.png) captures all fifteen formations and [`forest-seasons.png`](terrain-reference/forest-seasons.png) follows one ancient wood through spring, summer, autumn and winter. [`forest-reference.json`](terrain-reference/forest-reference.json) records the exact tiles, species mixes, age, goods and fauna behind every frame.

## Model in one paragraph

A tile gets one deterministic **stand** from its moisture, temperature, height and a small coarse-patch hash. The stand selects a formation (oakwood, beechwood, birch grove, maplewood, chestnut grove, linden/elm stand, mixed wood, alluvial wood, hillside wood, ancient wood, regenerating wood, burn scar, windthrow, diseased stand or cut-over wood), a species mix, an age class, a canopy density, a clearing/edge state, an understorey, ground layers, disturbance, goods and fauna. The renderer turns the same values into trees, saplings, shrubs, ferns, brambles, moss, leaf litter, roots, stones, stumps, logs, fungi, nests, hollows, wildlife herds and ambient insects. Resource geography uses the same formation to set timber capacity and expose a survey; it still keeps its original durable stock arrays, so old saves remain readable.

The wildlife layer is no longer one silhouette per tile. [`systems/forest-fauna.js`](../js/systems/forest-fauna.js) keeps a bounded, deterministic metapopulation of real herds. Each herd has a species, a home wood, a population, a carrying capacity, seasonal births and deaths, hunting pressure, periodic migration and occasional dispersal into a neighbouring wood. Large mammals and resident birds are simulated; butterflies, beetles, ants, bees and the remaining songbirds stay habitat markers in the renderer.

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
| 1.2.1.20 | Natural trails, game paths and open ground | Implemented | Deterministic `trail` field draws deer trails; clearings and cut-over gaps open the canopy. |
| 1.2.1.21 | Different forest soils and moisture | Implemented | `ground.soil` (`alluvial`, `dry`, `humus`, `loam`) and `humus`/`moss`/`litter` values; floor tint follows them. |
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
| 1.2.1.38 | Timber from different broadleaf species | Implemented | Per-species timber values and stand goods; Lumber Yard/Forester survey shows the formation and stock. |
| 1.2.1.39 | Firewood and charcoal | Implemented | Firewood is always available; charcoal appears in ancient/burned stands and winter seasonal data. |
| 1.2.1.40 | Mushrooms, berries, nuts and wild fruit | Implemented (survey) | Seasonal goods descriptors on each stand and resource node; existing wood/food ledger remains the economy authority. |
| 1.2.1.41 | Medicinal plants and herbs | Implemented (survey) | Herb seasonal goods and species-associated herb finds. |
| 1.2.1.42 | Wild meat, furs and hides | Implemented (survey) | `game`, `fur` and `hides` goods on hunting-capable stands, season-gated. |
| 1.2.1.43 | Honey and beeswax | Implemented (survey) | Linden/edge honey and the derived beeswax good; seasonal summer peak. |
| 1.2.1.44 | Acorns and natural fodder | Implemented (survey) | Acorn/beechnut/chestnut mast goods; autumn abundance. |
| 1.2.1.45 | Old-growth-like broadleaf woods | Implemented | `ancient` formation, ancient age bias, hollows, deep humus, logs, moss and rich fauna. |
| 1.2.1.46 | Bright beechwoods and dark oakwoods | Implemented | Distinct formations and palettes; beech palette is lighter and oak density/darkness higher. |
| 1.2.1.47 | Airy birch groves | Implemented | Low density, white trunks, heather, light canopy and pioneer goods. |
| 1.2.1.48 | Damp alluvial broadleaf woods | Implemented | `alluvial` formation for wet low ground: alder/elm/birch, ferns, moss, butterflies and herbs. |
| 1.2.1.49 | Hillside and steep mountain broadleaf woods | Implemented | `hillside` formation above the woodland belt: beech/oak/maple, mossy stone, raptors. |
| 1.2.1.50 | Single tree groups in open landscapes | Implemented | Renderer's lone mature tree/grove branch places isolated crowns outside closed forest. |
| 1.2.1.51 | Forest fires and dry burn scars | Implemented | Rare `burned` formation, charred snags, ash floor, charcoal and open regrowth. |
| 1.2.1.52 | Pest infestation and tree disease | Implemented | `diseased` formation with bare/thin crowns, deadwood and beetle/woodpecker fauna. |
| 1.2.1.53 | Storm damage and uprooted trees | Implemented | `windthrow` formation, toppled logs, root plates and shattered crowns. |
| 1.2.1.54 | Over-cutting and canopy loss | Implemented | Low stock ratio becomes `cutover`; low canopy, stumps, bramble and pioneer regrowth; resource stock is authoritative. |
| 1.2.1.55 | Soil compaction and over-hunting | Implemented (herd pressure) | Deterministic `ground.compaction` stays a presentation proxy; `ground.huntingPressure` now reduces herd growth in the population model. |
| 1.2.1.56 | Regeneration after fire, clearing and storm | Implemented | Burned/windthrow/cut-over stands transition to pioneer regeneration; `regrowForests` restores stock and the cutover branch recedes. |
| 1.2.1.57 | Sunbeams through canopy gaps | Implemented | `drawCanopyLight` screen-blended shafts and warm pool on clearing tiles. |
| 1.2.1.58 | Light ground mist and damp morning mood | Implemented | `drawForestMist` low-alpha drifting floor mist; no separate hour-of-day clock in the renderer. |
| 1.2.1.59 | Wind movement and falling leaves | Implemented | Per-tree sway, animated falling leaf marks, leaf carpet and windthrow debris. |
| 1.2.1.60 | Time- and season-dependent light/colour | Implemented | Continuous seasonal palette/turn/snow curves, lower winter sun and per-stand light/clearing; tick drives wind/light motion. |

## Wildlife population model

- **Bounded metapopulation.** The world holds at most 240 herds (`MAX_HERDS`). A herd lives on one wooded tile and is capped at 135% of its current carrying capacity. The herd list, not the renderer, is the source of truth for wildlife.
- **Deterministic growth.** Each species has a base population, reproduction rate, mortality rate, mobility and migration period. Carrying capacity follows stand preference (edge, clearing, young growth, mushrooms, mast, ancient trees, disease), forest stock and season. Spring raises reproduction, winter lowers it and raises losses, and hunting pressure reduces growth.
- **Movement and dispersal.** A herd checks a bounded neighbourhood when its migration period is due or it is crowded, and moves to a better neighbouring wood. A herd above 118% of capacity can split off a satellite herd into an empty neighbouring wood, respecting the 240-herd cap.
- **Persistence.** `state.forestFauna` is saved as optional version-1 data. Old saves without it still load and build herds on first use. Validation rejects malformed versions, herd lists, species, coordinates, populations and capacities.
- **Presentation and survey.** The renderer draws the herd on its home tile; the Lumber Yard and Forester site note reports the herd mix and population through `forestFaunaSummaryAt`. If no herd is present, the older habitat list remains a display fallback.
- **Not modelled.** This is not individual-animal genealogy, a predator-prey kill ledger or a territory polygon engine. Insects, butterflies, bees and ants remain ambient markers, and songbirds/raptors remain survey silhouettes rather than simulated populations.

## Deliberate limits

- **Wildlife is simulated at herd level, not per animal.** There is no individual pedigree, predator-prey kill accounting or territory geometry. The herd model is deterministic, saveable and observable through the map and site survey; the ambient insect layer is still decoration.
- **Forest products are descriptors, not a second currency.** The existing wood/food economy and logistics ledger remain authoritative. The survey exposes timber, firewood, charcoal, mushrooms, berries, nuts, herbs, honey, wax, game, fur and hides with seasonal abundance; a future gathering module can consume these descriptors without changing saves.
- **Compaction remains a pressure proxy; over-hunting feeds the herd model.** `ground.compaction` derives from harvest stock, trails, edges and cut-over state and affects presentation. `ground.huntingPressure` is read by the wildlife simulation and lowers herd growth; neither is a soil-chemistry or per-animal hunting model.
- **Disturbances are rare deterministic states**, not a live fire-spread or storm physics engine. The resource stock and regenerating formation still change what the player sees and harvests.
- **No real-GPU validation.** The committed sheets use Chromium's available WebGL renderer, which is software WebGL in this workspace. They prove the code paths, not target-GPU colour or frame time.

## Checks

```sh
cd game
npm test
npm run test:forest-reference
```

`npm test` covers the 15 formations, determinism, reachable site conditions, all eight species, age classes, disturbances, seasonal goods, fauna filtering, the herd population/migration/restore tests, resource-node integration and the seasonal foliage timings. `test:forest-reference` requires Chromium and Playwright; it captures all 15 formations plus a four-season sequence and fails on a missing formation, a page runtime error or a fatal WebGL diagnostic. Set `FOREST_REFERENCE_OUT` to redirect its artifacts.
