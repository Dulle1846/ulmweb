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
- **New events are rare and real.** Every 140 simulation days one new deterministic disturbance is chosen. It lowers that tile's actual `forestStock` to 35% (burn), 55% (windthrow) or 70% (disease) of its previous value and is recorded in a bounded 24-entry history. Regrowth rebuilds stock; compaction still slows that recovery.
- **Regrowth is live and bounded.** The simulation now runs `regrowForests` as a 400-day cycle split into 400 daily slices: each day processes one contiguous 1/400 share of the map, and every tile regrows once per cycle by `16 × compactionFactor` (minimum one). That preserves the one-stock-per-25-days average while keeping the per-tick cost small. On a 576 × 576 realm with 201,570 half-depleted forest tiles, a full pass took about 802 ms; one sliced pass takes 2.34 ms median and 5.71 ms worst.
- **40-year audit.** A deterministic 64 × 64 realm (seed `20261108`, 70 forest setting) was run for 16,000 days with the same daily loop as the game, on two seeds and with an active control policy. The disturbed share peaks at 9.5–10.0% in year one and settles at 6.6–7.3%; forest fill ends at 96.1–96.3%, with 239–245 recovered sites, 114 events and ~5,323 spreads. Peak disturbance never approaches a map takeover, so the spread rates were left unchanged. The 40-year control policy performed 293 paid containments without lowering the active share further; containment is local protection, not a requirement for the map to stay healthy. Without regrowth the same audit fell to 64.7% forest fill by year 40, which is why the wiring matters.
- **Recovered sites can be disturbed again.** A recovered record remains as a durable marker until a later event reuses the slot, so saves preserve both the recovery and the absence of the original seeded scar.
- **Presentation and save.** The terrain renderer, resource node, forest fauna stand, gathering ledger and Lumber Yard/Forester site note all receive the same succession lookup. Records advance once per simulation day, capped at 30 days per update so a suspended tab cannot skip an entire stage.
- **They spread.** Every 12 simulation days an active record may push into one adjacent stand; a pass is capped at four successful spreads, so a long campaign gains a spreading disturbance without a per-day neighbour scan of the whole map. Fire is more likely in a dry summer and much less likely in rain, windthrow follows storms, and disease favours fresh infections. A spread lowers the target tile's real `forestStock` to 72% and is recorded in a bounded 24-entry `spreadHistory`.
- **Control parties contain them.** A Lumber Yard or Forester's Lodge can spend food and wood (burn), wood (windthrow) or gold (disease) to hold the nearest active disturbance for 90 days. The building panel exposes `SUPPRESS FOREST DISTURBANCE`, which calls `suppressNearestForestDisturbance`; a contained record still ages but cannot spread. Its `containedUntil` date is part of the tile save record and appears in the site note.

## Ground, light and morning mist

- **Soil is a stand property.** `forestStandAt` exposes `ground.soil` (`loam`, `humus`, `alluvial`, `dry`), `humus`, `litter`, `moss`, `flowers` and the existing `compaction` proxy. The renderer adds a small soil wash in the stand's soil colour and draws cracks only on dry ground, so a damp alluvial wood and a thin dry ridge no longer share one floor.
- **One solar vector.** `solarVector(timeOfDay, season)` in [`presentation/rendering/daylight.js`](../js/presentation/rendering/daylight.js) returns the sun direction, shadow direction and shadow step. It drives the dawn/dusk gradient, the cast shadows under trees, the canopy light shafts and the WebGL ground-shadow march, so dawn and evening agree instead of each renderer inventing an angle. Noon remains the neutral default.
- **Mist is weather and soil, not a constant overlay.** `forestMistFactor(timeOfDay, moisture, season, weather)` peaks shortly after dawn, follows soil moisture, is stronger in spring/autumn and with fog or rain, and is zero at noon and at night. The terrain pass only draws mist when the factor is above 0.04.

## Herds as groups, signs and microfauna

- **A herd is drawn as a group.** The number of silhouettes follows population (1–4 large animals, 1–3 birds, 1–3 small animals), each with a small deterministic in-tile walk. The same tile carries readable signs through `forestFaunaSignAt`: tracks, browsed shoots in young growth, a carcass after a recent kill, a nest/hollow for hollow-nesting birds and territory marks (a fox's scent/scratch sign or a bird's song post). These are read-only views of the herd model, not a second save.
- **Microfauna follows habitat.** `forestMicrofaunaAt` derives stag beetles, wood ants, woodland butterflies, wild bees and wood mice from deadwood, litter, flowers, light and season. Flying insects disappear in winter; the renderer caps the layer at three groups of three marks and only draws it at close zoom.
- **Species-specific floor.** The dominant species contributes its leaf outline (lobed, oval, triangular, palmate, lance, heart, serrated, round) to the leaf carpet, so an oak wood and a birch grove read differently on the ground as well as in the crown.

## Species timber and forest goods

- **Eight distinct timbers.** Every species declares a `wood` good: `oak-timber`, `beech-timber`, `birch-timber`, `maple-timber`, `chestnut-timber`, `linden-timber`, `elm-timber` and `alder-timber`. A stand lists the timbers of all species in its mix alongside generic `timber`, firewood and charcoal. Wood goods stay available in every season, so the species timber actually reaches the gather ledger instead of being filtered out as an out-of-season forage good.
- **Linden and elm are named separately.** The shared `linden-elm` formation keeps its 15-formation slot, but the survey label is `Linden Stand` or `Elm Stand` according to the dominant linden/elm share, with a matching `subtype`.
- **More real understory goods.** Chanterelles, porcini, wild garlic, wood sorrel, wild strawberries, sloes and crab apples extend the seasonal table. Spring favours wild garlic and sorrel, summer strawberries, autumn chanterelles, porcini, sloes and crab apples; they are subject to the same seasonal presence rule as the older goods.

## Forest products ledger

The seasonal gathering ledger lives in [`systems/forest-gathering.js`](../js/systems/forest-gathering.js) and is deliberately local to the wood. It is not a second city currency and adds no HUD bar.

- **Same stand as the renderer.** `forestProductsAt(x, y, day)` re-reads the resource node and `forestStandAt`, so the gather list, season and abundance are the values the player sees on the tile. Timber, firewood and charcoal come from the standing stock; mushrooms, berries, nuts, herbs, honey, beeswax, game, fur and hides are seasonal forage goods.
- **Hunting closes the loop.** A gather that includes game calls `harvestForestGameAt` once and only adds `game`, `fur` and `hides` if a herd was actually present. The returned prime/good/lean band is stored in the ledger's quality map. `PROCESS FOREST HUNT` converts raw game, furs and hides into cured game, tanned furs and cured hides while preserving each unit's band. A Stable can consume gathered mast through `FEED STABLE FROM MAST`; the reserve is stored on the building and decremented by `updateForestPannage`.
- **Harvest has a cost.** Timber, firewood and charcoal reduce the node's real `forestStock`, so gathering feeds depletion, the cut-over formation and the compaction brake. Forage does not remove standing timber, but it is still recorded in the ledger.
- **Bounded and repeatable.** A tile can be gathered once per day, the ledger stock and history are capped, and `gatherNearestForestProducts` lets a Lumber Yard or Forester's Lodge act on the nearest real forest node. The management panel exposes one `GATHER FOREST PRODUCTS` action.
- **Persistent.** `state.forestGathering` is version-1 save data with strict validation and a serialize/restore round trip. Old saves without it load and start with an empty ledger.
- **Tested.** `tests/systems/forest-gathering.test.js` covers seasonality, the same-day cooldown, stock bounds, save round trips and the nearest-node action.

## Forester stewardship

A staffed Forester's Lodge plants up to two stock per simulation tick, scaled by its actual workforce efficiency, into the most depleted stands within five tiles. The building register renders a dedicated **Forest Stewardship** block with the range's live stock/capacity, a fill meter, the number of restorable stands and the current action. Selecting the lodge also overlays its five-tile range on the map and marks every restorable stand: red for bare ground, amber while recovering and green when it is nearly full. The markers disappear as the Forester fills the range, so the effect is visible without opening the management panel.

The Forester's catalogue entry keeps `site: "forest"` for placement, but `produceRecipe` skips its old zero-batch harvest path so the Lumber Yard recipe cannot overwrite the stewardship status with a false "Forest stand is depleted" message. Planting and felling also advance `forestVisualRevision` only when a stand crosses a visible tenth (and the 18% cut-over transition), which invalidates the cached terrain detail layer at meaningful stages instead of for every sapling. The dedicated browser audit `tests/browser/forester-stewardship.mjs` starts a real realm, places a staffed lodge in three cut-over stands, reads the rendered block over multiple ticks, checks the `Planting saplings` → `Forest is fully grown` transition, confirms that the false depletion status never appears and captures before/progress/after screenshots plus the raster hashes. `tests/systems/forester-stewardship.test.js` covers the prioritisation, the range summary and the production-reason regression; `tests/systems/resource-geography.test.js` covers the cache invalidation stages.

### Five-year stewardship audit

The browser audit `tests/browser/forester-stewardship-longrun.mjs` keeps one staffed lodge on the same real range for five game years (2,000 days). Each year cuts three stands (255 stock), thins four stands every twenty days and receives one annual clear-cut at day 180; the starting Lumber Yard also harvests on its normal cadence. In seed `20261108` the 45-tile range holds 5,089 stock. Across the five years the audit removed 3,280 stock while the Forester planted 3,275 saplings; every year ended at 5,089/5,089 (100 %), 0 restorable stands and `Forest is fully grown`. The lowest fill after a cut was 94.9 %, and neither `Forest stand is depleted` nor `Waiting for planting space` appeared. Each of the five cut frames carried three red markers; each recovered frame carried none. The terrain raster changed between every cut and recovery pair, the starting Lumber Yard kept the Forester planting on 328 days per year, and the rendered stock/capacity/restorable/status values matched the live simulation every year. The run writes `forester-stewardship-longrun.json` plus five cut/grown map pairs and the stewardship captures under [`docs/forester-stewardship-longrun/`](forester-stewardship-longrun/); it is not part of `npm test`. The deterministic companion `tests/systems/forester-stewardship-longrun.test.js` runs five years on a 64 × 64 realm with a sixteen-stand range, annual two-stand clear-cuts and twenty-day thinning, and fails if the range collapses below 70 %, the year-end stock is not full, the status is wrong or the visual revision stops advancing.

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

### Hundred-year harvest and regrowth audit

The forestry audit used the same deterministic 64 × 64 realm (seed `20261108`, 70 forest setting, full starting stock). For 100 years (40,000 days) it ran daily disturbance succession and the game's sliced `regrowForests` pass. Lumber Yards were modelled at the real recipe cadence: every six days each yard took two stock from the nearest forest within seven tiles. A player visit used the real `gatherNearestForestProducts` action at four sites every five days, harvesting the normal several wood goods from one tile.

| Scenario | Lumber Yards | Gathering | Stock harvested | Stock regrown | Lowest fill | Final fill | Depleted tiles at end |
|---|---:|---|---:|---:|---:|---:|---:|
| Managed forestry | 8 | none | 102,167 | 367,569 | 91.7 % (year 63) | 91.8 % | 62 |
| Managed + player gathering | 8 | 4 sites every 5 days | 234,530 | 477,413 | 85.0 % (year 95) | 85.1 % | 175 |
| Intensive stress | 40 | 8 sites every 5 days | 769,440 | 917,977 | 60.0 % (year 98) | 60.1 % | 499 |

- **Verdict.** Managed forestry is sustainable over a century. Lumber Yards alone leave 91.8 % of the original stock; adding regular player gathering still ends at 85.1 %, with no failed harvesting action and only 7.1 % of forest tiles fully depleted.
- **The intensive case thins rather than collapses.** It removes 769,440 stock but regrows 917,977, yet ends at 60.1 % fill. The loss is spatial, not global: fixed yards and gather sites keep pressing the same neighbourhoods while regrowth happens across the whole map. 499 of 2,469 forest tiles are fully depleted and 908 are below a quarter of capacity at year 100. Harvest and regrowth rates were left unchanged.
- **200-year extension.** The intensive case was rerun for 200 years on three seeds. Seed `20261108` went from 60.06 % fill at year 100 to 59.93 % at year 200 (minimum 59.88 % in year 196); seed `7` went from 62.42 % to 62.32 % (minimum 62.24 %); seed `99` went from 61.07 % to 60.59 % (minimum 60.59 %). The linear trend in years 101–200 was −0.0013, −0.0008 and −0.0035 percentage points per year respectively, with 0 failed harvesting actions on every seed. Fully depleted tiles stayed at 499–504 (seed `20261108`) and 473–479 on the other seeds. The intensive case therefore remains in a 60–62 % band and does not collapse; the slow negative trend on seed `99` is not a tipping trajectory within the tested 200 years. It remains an observed operating point, not an enforced ceiling. This stress extension is an audit rather than a default test because it adds about twenty seconds to the suite.
- **Operating point, not a proven ceiling.** Pressures above 40 yards plus eight gathering sites were not simulated, so the intensive row is an observed thinned state at the end of the run, not a limit the game enforces.
- **Durable regression.** The century scenario with 8 yards and 4 gathering sites is the first test in `tests/systems/forest-succession-longrun.test.js`. It fails if regrowth does not cover harvest, fill drops below 80 %, more than a tenth of forest tiles become fully depleted, or harvesting actions start failing. It adds about six seconds to the suite.

## Deliberate limits

- **Wildlife is simulated at herd level, not per animal.** There is no individual pedigree, predator-prey kill accounting or territory geometry. The herd model is deterministic, saveable and observable through the map and site survey; the ambient insect layer is still decoration.
- **Forest products are a local seasonal ledger, not a second city currency.** The existing wood/food economy and logistics ledger remain authoritative; the forest ledger records what a wood yielded, keeps a bounded stock and history, and reduces real standing timber for wood products. It does not add a parallel treasury or HUD economy.
- **Compaction is a real regrowth brake; over-hunting is a herd-level offtake pressure.** `ground.compaction` derives from harvest stock, trails, edges and cut-over state. `forestRegrowthFactor(stand) = max(0.35, 1 − 0.65 × compaction)` is applied by `regrowForests`, so a compacted wood recovers visibly less stock. `ground.huntingPressure` remains an ecological survey value, but population growth now reads `herd.huntingPressure` created by an actual harvest. Neither is a soil-chemistry or per-animal kill model.
- **Disturbances spread coarsely, not as physics.** A 12-day pass lets an active record claim one neighbouring stand, capped at four spreads per pass. This is a deterministic, saveable neighbour rule, not a wind-field, ember-transport or pathogen-growth simulation; control is a 90-day containment window with a resource cost, not a firefighting crew model.
- **Microfauna is habitat-derived.** The insect and small-mammal layer is computed from the stand each frame and is not saved as a population. It is deliberately capped and close-zoom only; herd populations remain the only saved fauna model.
- **Pannage is a feed reserve, not a livestock breeding simulator.** A Stable consumes real gathered mast and stores horse-days, but the current model does not breed horses, track individual animals or turn the reserve into a separate meat/milk chain.
- **No real-GPU validation.** The committed sheets use Chromium's available WebGL renderer, which is software WebGL in this workspace. They prove the code paths, not target-GPU colour or frame time.

## Checks

```sh
cd game
npm test
npm run test:forest-reference
npm run test:forest-detail
```

`npm test` currently passes **572/572** and covers the 15 formations, determinism, reachable site conditions, all eight species, age classes, disturbances and their temporal succession, seasonal goods, fauna filtering, the herd population/migration/restore tests, real hunting offtake, quality/processing, pannage, forest gathering, compaction, disturbance spread and control, the four-decade disturbance/regrowth audit, the century timber-harvest/regrowth audit, short and five-year forester stewardship, solar vector and mist, microfauna, species timber, resource-node integration and the seasonal foliage timings. `test:forest-reference` requires Chromium and Playwright; it captures all 15 formations plus a four-season sequence and fails on a missing formation, a page runtime error or a fatal WebGL diagnostic. `test:forest-detail` captures the thirteen native close-ups and writes `forest-detail-reference.png`/`.json`; it waits for the terrain cache to rebuild before each frame, so a slow software renderer cannot silently save the previous view. Set `FOREST_REFERENCE_OUT` or `FOREST_DETAIL_OUT` to redirect the artifacts.
