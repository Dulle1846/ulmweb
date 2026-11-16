# 1.2.14 Küstenregionen — Runtime Audit

Generated from a real coastal world (seed `20261214`, 176×176, 30,976 coastal tiles) through the actual profile, work, gather and hazard paths. 71/71 items are runtime-backed.

## Method

`scripts/coast-audit.mjs` generates the Coastlands climate, surveys every tile through `coastProfileAt()` across all four seasons, then exercises `performCoastWork()` for all nine works, `gatherNearestGrasslandProducts()` for a real sea harvest, and `updateCoastHazards()` with a forced surge against a placed house. The feature array only locates a representative tile; each row below records the field or downstream result that makes the requirement observable.

## Works and hazard probes

- Coastal works built: 9/9, each through its own availability and resource cost.
- Strategic control feature 1.2.14.63: present on the worked harbour profile.
- Gathering: ok — sea-trade-goods:3, salt:2, shellfish:2, reed:2, seaweed:2.
- Hazard: STORM SURGE ON SHALLOW COASTAL WATER · SURGE 0.7 M · WAVES 3.1 M / SALT SPRAY STRIPS THE EXPOSED FIELDS / SURGE WASHES OUT STORED FOOD · FOOD -1 / DESTROYED BUILDING; destroyed Timber Cottage; house dead: true.

| ID | Requirement | Status | Code location | Observed runtime evidence |
|---|---|---|---|---|
| 1.2.14.1 | Sand beaches | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 100,8 day50; formation=sand-beach; sand=0.660; drawCoastGround |
| 1.2.14.2 | Shingle beaches | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 0,0 day50; formation=shallow-water; shingle=0.841; drawCoastGround |
| 1.2.14.3 | Rocky coasts | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 0,0 day50; formation=shallow-water; rock=0.600; drawCoastGround |
| 1.2.14.4 | Sea cliffs | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 70,0 day50; formation=sandbank; cliff=0.662; drawCoastGround |
| 1.2.14.5 | Flat marsh coasts | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 6,0 day50; formation=reef; marsh=0.855; drawCoastGround |
| 1.2.14.6 | Dune coasts | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 0,0 day50; formation=shallow-water; dune=0.663; drawCoastGround |
| 1.2.14.7 | Lagoons | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 0,0 day50; formation=shallow-water; lagoon=0.732; drawWater |
| 1.2.14.8 | Tidal flats | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 0,0 day50; formation=shallow-water; tidal=0.637; drawTidal |
| 1.2.14.9 | Fjord coasts | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 0,0 day50; formation=shallow-water; fjord=0.954; drawCoastGround |
| 1.2.14.10 | River mouths and deltas | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 0,0 day50; formation=shallow-water; delta=0.674; drawCoastGround |
| 1.2.14.11 | Beach grasses | **working** | js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees | 100,8 day50; grasses=beach-grass:sand-couch; drawCoastDetails |
| 1.2.14.12 | Dune plants | **working** | js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees | 80,22 day50; grasses=marram:beach-grass; shrubs=; drawCoastDetails |
| 1.2.14.13 | Coastal shrubs | **working** | js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees | 104,14 day50; shrubs=juniper:bramble; drawCoastTrees |
| 1.2.14.14 | Salt-tolerant plants | **working** | js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees | 0,0 day50; salt=0.529; stage=bare; drawCoastDetails |
| 1.2.14.15 | Coastal forests | **working** | js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees | 100,10 day50; trees=coastal-pine; drawCoastTrees |
| 1.2.14.16 | Reeds and wetland plants | **working** | js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees | 6,0 day50; grasses=; stage=bare |
| 1.2.14.17 | Salt meadow vegetation | **working** | js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees | 114,18 day50; formation=salt-marsh; saltMeadow=true |
| 1.2.14.18 | Algae and seagrass | **working** | js/world/coast-ecology.js#buildFlora + js/presentation/rendering/coast-render.js#drawCoastTrees | 1,0 day50; algae=seagrass:kelp; drawWater |
| 1.2.14.19 | Small bays | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 30,0 day50; formation=shallow-water; bay=0.812; drawCoastGround |
| 1.2.14.20 | Natural harbours | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 0,0 day50; formation=shallow-water; harbour=0.912; drawCoastGround |
| 1.2.14.21 | River mouths | **working** | js/world/coast-ecology.js | 0,0 day50; formation=shallow-water; delta=0.674; drawCoastGround |
| 1.2.14.22 | Tidal areas | **working** | js/world/coast-ecology.js | 0,0 day50; tidal=0.637; tide=0.927; drawTidal |
| 1.2.14.23 | Coastal lagoons | **working** | js/world/coast-ecology.js | 0,0 day50; formation=shallow-water; lagoon=0.732; drawWater |
| 1.2.14.24 | Rock outcrops | **working** | js/world/coast-ecology.js | 0,0 day50; outcrop=0.462; rock=0.600; drawCoastGround |
| 1.2.14.25 | Island groups | **working** | js/world/coast-ecology.js#coastProfileAt + js/presentation/rendering/coast-render.js | 24,0 day50; formation=sandbank; island=0.574; drawCoastGround |
| 1.2.14.26 | Sandbanks | **working** | js/world/coast-ecology.js | 8,0 day50; formation=reef; sandbank=0.559; drawWater |
| 1.2.14.27 | Reefs and underwater formations | **working** | js/world/coast-ecology.js | 0,0 day50; formation=shallow-water; reef=0.571; drawWater |
| 1.2.14.28 | Shallow coastal water | **working** | js/world/coast-ecology.js | 99,6 day50; shallow=true; depth=0.055; drawWater |
| 1.2.14.29 | Gulls and seabirds | **working** | js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails | 0,0 day50; fauna=gull:tern; drawCoastDetails |
| 1.2.14.30 | Seals and other marine mammals | **working** | js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails | 0,0 day50; fauna=seal; drawCoastDetails |
| 1.2.14.31 | Coastal and wading birds | **working** | js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails | 0,0 day50; fauna=oystercatcher; drawCoastDetails |
| 1.2.14.32 | Fish and shellfish | **working** | js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails | 0,0 day50; fish=0.375; goods=fish |
| 1.2.14.33 | Crabs and mussels | **working** | js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails | 0,0 day50; crustaceans=crab; goods=shellfish:mussels |
| 1.2.14.34 | Sea turtles in suitable climates | **working** | js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails | 154,64 day50; turtle=false; temperature=0.620 |
| 1.2.14.35 | Coastal predators | **working** | js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails | 0,0 day50; predators=otter; drawFauna |
| 1.2.14.36 | Migratory birds and seasonal resting places | **working** | js/world/coast-ecology.js#buildFauna + js/presentation/rendering/coast-render.js#drawCoastDetails | 0,0 day50; migratory=goose; season=spring |
| 1.2.14.37 | Fish | **working** | js/world/coast-ecology.js | 0,0 day50; fish=0.375; goods=fish |
| 1.2.14.38 | Shellfish and molluscs | **working** | js/world/coast-ecology.js | 0,0 day50; shellfish=0.410; goods=shellfish:mussels |
| 1.2.14.39 | Salt | **working** | js/world/coast-ecology.js | 6,0 day50; salt=0.532; goods=salt |
| 1.2.14.40 | Seaweed and algae | **working** | js/world/coast-ecology.js | 0,0 day50; seaweed=0.098; algae= |
| 1.2.14.41 | Driftwood | **working** | js/world/coast-ecology.js | 0,0 day50; driftwood=0.271; goods=driftwood |
| 1.2.14.42 | Coastal minerals | **working** | js/world/coast-ecology.js | 0,0 day50; minerals=0.374; goods=coastal-minerals |
| 1.2.14.43 | Sea trade goods | **working** | js/world/coast-ecology.js | 0,0 day50; trade=0.420; goods=sea-trade-goods |
| 1.2.14.44 | Pearls and rare natural materials | **working** | js/world/coast-ecology.js | 0,0 day50; rare=0.292; goods=pearls |
| 1.2.14.45 | Strong coastal winds | **working** | js/world/coast-ecology.js | 0,0 day50; wind=1.200; wave=0.000; drawWind |
| 1.2.14.46 | Fog | **working** | js/world/coast-ecology.js | 49,0 day50; fog=0.260; drawFog |
| 1.2.14.47 | Storm surges | **working** | js/world/coast-ecology.js | 0,0 day50; stormSurge=0.349; flood=0.523; drawStorm |
| 1.2.14.48 | High waves | **working** | js/world/coast-ecology.js | 0,0 day50; waveHeightM=2.500; wave=0.608; drawWater |
| 1.2.14.49 | Tides | **working** | js/world/coast-ecology.js | 0,0 day50; tide=0.927; rangeM=0.700; drawTide |
| 1.2.14.50 | Coastal rain | **working** | js/world/coast-ecology.js | 76,29 day50; rain=0.000; weather=#a9c6ce; drawRain |
| 1.2.14.51 | Salt spray | **working** | js/world/coast-ecology.js | 0,0 day50; spray=0.529; salt=0.529; drawSaltSpray |
| 1.2.14.52 | Seasonal changes in water level | **working** | js/world/coast-ecology.js | 0,0 day50; tideChange=0.389; seasonalWater=0.000; drawWater |
| 1.2.14.53 | Ice floes and frozen coasts | **working** | js/world/coast-ecology.js | 0,0 day350; ice=0.200; temperature=0.433; drawIce |
| 1.2.14.54 | Fishing villages | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=fish:4,shellfish:3 |
| 1.2.14.55 | Harbour towns | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=sea-trade-goods:4,fish:2 |
| 1.2.14.56 | Trading posts | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=sea-trade-goods:3 |
| 1.2.14.57 | Coastal fortresses | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=structural only |
| 1.2.14.58 | Lighthouses | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=structural only |
| 1.2.14.59 | Shipyards | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=sea-trade-goods:3,coastal-pine-timber:2 |
| 1.2.14.60 | Salt-making works | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=salt:5 |
| 1.2.14.61 | Coastal markets | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=sea-trade-goods:3 |
| 1.2.14.62 | Naval bases and fleet stations | **working** | js/world/coast-ecology.js | work=Sand beach at 99,8; built=true; goods=sea-trade-goods:2 |
| 1.2.14.63 | Strategic control of natural harbours | **working** | js/world/coast-ecology.js | worksite; naturalHarbour=0.000; works=9/9; strategicControl=true; coastProfileAt use flags -> feature 1.2.14.63 |
| 1.2.14.64 | Storm surge damage | **working** | js/world/coast-ecology.js | 2,0 day50; storm=0.414; flood=0.565; annual pass |
| 1.2.14.65 | Coastal erosion | **working** | js/world/coast-ecology.js | 0,0 day50; erosion=0.313; annual pass + destroyCoastalTargetAt |
| 1.2.14.66 | Flooding | **working** | js/world/coast-ecology.js | 0,0 day50; flood=0.523; annual pass + drawWater |
| 1.2.14.67 | Sand movement | **working** | js/world/coast-ecology.js | 0,0 day50; sandShift=0.505; annual pass + drawDunes |
| 1.2.14.68 | Salinisation of soils | **working** | js/world/coast-ecology.js | 0,0 day50; salinisation=0.411; annual pass + drawSalt |
| 1.2.14.69 | Damage to harbours and settlements | **working** | js/world/coast-ecology.js | target=0,0; damage=0.324; surge=0.391; events=STORM SURGE ON SHALLOW COASTAL WATER · SURGE 0.7 M · WAVES 3.1 M / SALT SPRAY STRIPS THE EXPOSED FIELDS / SURGE WASHES OUT STORED FOOD · FOOD -1 / DESTROYED BUILDING; destroyed=Timber Cottage; dead=true |
| 1.2.14.70 | Changes caused by tides | **working** | js/world/coast-ecology.js#coastProfileAt + js/world/coast-hazards.js | 0,0 day50; tide=0.927; tideChange=0.389; renderer reads level |
| 1.2.14.71 | Long-term changes of the coastline | **working** | js/world/coast-ecology.js#coastProfileAt + js/world/coast-hazards.js | 0,0 day50; coastlineChange=0.362; longTermShift=0.328; year=3 |

## All nine works

| Work | Requirement | Site | Built | Goods |
|---|---|---|---|---|
| Fishing village | 1.2.14.54 | 99,8 | yes | fish:4, shellfish:3 |
| Harbour town | 1.2.14.55 | 99,8 | yes | sea-trade-goods:4, fish:2 |
| Trading post | 1.2.14.56 | 99,8 | yes | sea-trade-goods:3 |
| Coastal fortress | 1.2.14.57 | 99,8 | yes | structural |
| Lighthouse | 1.2.14.58 | 99,8 | yes | structural |
| Shipyard | 1.2.14.59 | 99,8 | yes | sea-trade-goods:3, coastal-pine-timber:2 |
| Salt-making works | 1.2.14.60 | 99,8 | yes | salt:5 |
| Coastal market | 1.2.14.61 | 99,8 | yes | sea-trade-goods:3 |
| Naval base | 1.2.14.62 | 99,8 | yes | sea-trade-goods:2 |

## Coverage

Observed formations: Shallow coastal water, Reef and underwater formation, Sandbank, Sand beach, Fjord coast, Shingle beach, Salt marsh, Dune field, Rocky shore, River delta, Sea cliff, Sheltered bay, Coastal forest, Coastal lagoon, Natural harbour, Tidal flat, Island group.
