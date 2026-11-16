# 1.2.13 Vulkanlandschaften — Runtime Audit

Generated from a real generated world (seed `20261212`, 176×176, 30,976 volcanic tiles) and the actual work, gathering, hazard and construction paths. 73/73 items have a runtime-backed status.

## Method

`scripts/volcano-audit.mjs` calls `generateWorldData()` with the volcanic climate, surveys every tile through `volcanoProfileAt()`, then exercises `performVolcanoWork()`, `gatherMeadowProducts()`, `updateVolcanoHazards()`, `destroyVolcanicTargetAt()` and `volcanicSiteVerdictAt()`. The browser formation reference (`tests/browser/volcano-formations.mjs`) separately captures all ten formations from the live renderer: 10/10 formations, seed 20261212, no page or console errors. The image is committed beside this report: [volcano-formations.png](volcano-formations.png).

The `features` array is used only to locate a representative tile. Each row below also reports the actual profile field and the consumer that makes the item observable, so a label alone cannot pass the audit.

The multi-year settlement campaign (`scripts/volcano-campaign.mjs`, seed `20260004`, 9 years / 3200 ticks) starts the shipped realm and runs the real simulation, construction, logistics, population and event systems. The two annual hazard passes use the real candidate scan, event log and destruction path; `focus` selects the eruption or earthquake branch so this proof is deterministic rather than roll-dependent. Result: **Flour Mill** destroyed by eruption, **Sawmill** destroyed by earthquake, and both rebuilt to **COMPLETED**: Flour Mill, Sawmill.

| ID | Requirement | Status | Code location | Observed runtime evidence |
|---|---|---|---|---|
| 1.2.13.1 | Single volcanic cones | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 64,26 y1; formation=single-cone; cone=0.459; drawCone |
| 1.2.13.2 | Large volcanic craters | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 108,21 y1; formation=large-crater; crater=0.807; drawCrater |
| 1.2.13.3 | Several craters inside a volcanic field | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 22,0 y1; formation=crater-field; crater=0.140; drawCrater twice |
| 1.2.13.4 | Shield volcanoes | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 0,0 y1; formation=shield-volcano; shield=0.800; broad drawCone |
| 1.2.13.5 | Steep volcanic cones | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 107,17 y1; formation=steep-cone; slope=0.695; steep drawCone |
| 1.2.13.6 | Collapsed craters and calderas | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 81,27 y1; formation=caldera; caldera=0.870; drawCrater |
| 1.2.13.7 | Lava fissures | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 16,0 y1; formation=volcanic-chain; fissure=0.761; drawFissure |
| 1.2.13.8 | Volcanic mountain chains | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 9,0 y1; formation=volcanic-chain; chain=0.832; two cones |
| 1.2.13.9 | Extinct volcanoes with weathered forms | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 52,0 y1; formation=extinct-volcano; oldLava=0.798; eroded drawCone |
| 1.2.13.10 | Fresh dark lava fields | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 3,0 y1; freshLava=0.946; drawLavaField |
| 1.2.13.11 | Old weathered lava surfaces | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 16,0 y1; oldLava=0.627; weathered lava ground |
| 1.2.13.12 | Solidified lava flows | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoGround | 5,0 y1; lavaFlow=0.447; drawLavaField/crack |
| 1.2.13.13 | Basalt formations | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals | 10,0 y1; basalt=0.336; drawSulfurAndMinerals |
| 1.2.13.14 | Pumice fields | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals | 3,0 y1; pumice=0.404; pumice speckles |
| 1.2.13.15 | Obsidian occurrences | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals | 16,0 y1; obsidian=0.540; obsidian shard |
| 1.2.13.16 | Volcanic rock spires | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals | 110,18 y1; spires=0.479; spire triangles |
| 1.2.13.17 | Broken and fissured rock surfaces | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals | 3,0 y1; brokenRock=0.497; broken clinker lines |
| 1.2.13.18 | Different lava colours and textures | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals | 12,0 y1; lavaColour=grey; ground=#363532; lava=#b34321 |
| 1.2.13.19 | Smoking craters | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoDetails | 108,21 y1; smoke=0.606; drawSteam |
| 1.2.13.20 | Steam vents | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoDetails | 4,0 y1; steam=0.391; drawSteam |
| 1.2.13.21 | Glowing lava in active areas | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoDetails | 3,0 y1; hotRock=0.631; active=true; drawLavaCrack/drawCrater |
| 1.2.13.22 | Small lava streams | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoDetails | 3,0 y1; lavaFlow=0.620; drawLavaCrack/drawFissure |
| 1.2.13.23 | Ash emissions | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoDetails | 3,0 y1; ash=0.481; drawAshPlume |
| 1.2.13.24 | Sulfur deposits | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals | 22,0 y1; sulfur=0.884; yellow sulfur dots |
| 1.2.13.25 | Hot rock surfaces | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoDetails | 3,0 y1; hotRock=0.631; drawHotRock |
| 1.2.13.26 | Earthquakes and ground cracks | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/world/volcano-hazards.js#updateVolcanoHazards | 3,0 y1; earthquake=0.491; drawFissure + annual quake |
| 1.2.13.27 | Hot springs | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawHotWater/drawWatercourse | 4,0 y1; hotSpring=0.573; drawHotWater |
| 1.2.13.28 | Geysers | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawHotWater/drawWatercourse | 4,0 y1; geyser=0.537; drawHotWater plume |
| 1.2.13.29 | Fumaroles | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawHotWater/drawWatercourse | 22,0 y1; fumarole=0.525; drawSteam |
| 1.2.13.30 | Sulfur springs | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawHotWater/drawWatercourse | 22,0 y1; sulfurSpring=0.633; sulfur-coloured pool |
| 1.2.13.31 | Mineral deposits | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawSulfurAndMinerals | 3,0 y1; minerals=0.377; mineral vein |
| 1.2.13.32 | Volcanic mud pools | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawHotWater/drawWatercourse | 44,0 y1; mudPool=0.416; drawHotWater |
| 1.2.13.33 | Geothermally heated water | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawHotWater/drawWatercourse | 4,0 y1; heatedWater=0.576; drawHotWater |
| 1.2.13.34 | Steaming ground | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawVolcanoDetails | 8,0 y1; steam=0.316; hotRock=0.631; steaming ground |
| 1.2.13.35 | Sparsely vegetated young lava | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora | 3,0 y1; stage=bare; soilAge=0.067; no flora branch |
| 1.2.13.36 | First lichens and mosses | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora | 0,0 y1; mosses=moss,lava-lichen; drawFlora |
| 1.2.13.37 | Pioneer plants | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora | 0,0 y1; stage=grass; grasses=fescue |
| 1.2.13.38 | Grasses on weathered volcanic soil | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora | 0,0 y1; grasses=fescue; grass strokes |
| 1.2.13.39 | Shrub vegetation on older surfaces | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora | 2,0 y1; shrubs=manzanita; shrub arc |
| 1.2.13.40 | Fertile soils in suitable volcanic regions | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora | 0,0 y1; fertile=0.625; goods=iron-ore,game,volcanic-minerals,volcanic-soil,copper-ore,fur |
| 1.2.13.41 | Different regeneration stages | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora | 0,0 y1; stage=grass; rank=3; yearsSinceEruption=7 |
| 1.2.13.42 | Heat and drought adapted plants | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/presentation/rendering/volcano-render.js#drawFlora | 10,0 y1; flowers=sulfur-cinquefoil; temperature=0.553 |
| 1.2.13.43 | Small reptiles in warm regions | **working** | js/world/volcano-ecology.js#buildFauna + js/presentation/rendering/volcano-render.js#drawFauna/drawCaveMouth | 3,0 y1; fauna=lava-lizard; drawFauna |
| 1.2.13.44 | Birds at suitable rock and crater sites | **working** | js/world/volcano-ecology.js#buildFauna + js/presentation/rendering/volcano-render.js#drawFauna/drawCaveMouth | 4,0 y1; birds=raven |
| 1.2.13.45 | Insects and pioneer species | **working** | js/world/volcano-ecology.js#buildFauna + js/presentation/rendering/volcano-render.js#drawFauna/drawCaveMouth | 0,0 y1; insects=beetle |
| 1.2.13.46 | Mammals on older vegetated volcanic ground | **working** | js/world/volcano-ecology.js#buildFauna + js/presentation/rendering/volcano-render.js#drawFauna/drawCaveMouth | 0,0 y1; mammals=mouse,feral-goat |
| 1.2.13.47 | Cave and crevice dwellers | **working** | js/world/volcano-ecology.js#buildFauna + js/presentation/rendering/volcano-render.js#drawFauna/drawCaveMouth | 24,0 y1; cave=true; fauna=bat; drawCaveMouth |
| 1.2.13.48 | Specialised animals in hot mineral-rich areas | **working** | js/world/volcano-ecology.js#buildFauna + js/presentation/rendering/volcano-render.js#drawFauna/drawCaveMouth | 3,0 y1; hotRock=0.631; fauna=lava-lizard |
| 1.2.13.49 | Basalt and other volcanic stone | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Lava field at 105,9; goods=basalt:6; sample=10,0 y1 |
| 1.2.13.50 | Obsidian | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Lava field at 108,9; goods=obsidian:5,crater-crystal:1; sample=16,0 y1 |
| 1.2.13.51 | Pumice | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Lava field at 100,9; goods=pumice:7; sample=3,0 y1 |
| 1.2.13.52 | Sulfur | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Volcanic crater field at 63,18; goods=sulfur:7,volcanic-minerals:3; sample=22,0 y1 |
| 1.2.13.53 | Metal ores | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Lava field at 100,9; goods=iron-ore:4; sample=0,0 y1 |
| 1.2.13.54 | Mineral deposits | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Lava field at 100,9; goods=volcanic-minerals:7; sample=0,0 y1 |
| 1.2.13.55 | Geothermal energy | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Lava field at 100,9; goods=geothermal-energy:3,hot-spring-water:4; sample=3,0 y1 |
| 1.2.13.56 | Fertile volcanic soils | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Lava field at 100,9; goods=volcanic-soil:5; sample=0,0 y1 |
| 1.2.13.57 | Rare materials in crater regions | **working** | js/world/volcano-works.js + js/systems/forest-gathering.js#performVolcanoWork | work=Lava field at 100,9; goods=crater-crystal:2,volcanic-minerals:2; sample=18,0 y1 |
| 1.2.13.58 | Volcanic eruptions | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/world/volcano-hazards.js#updateVolcanoHazards | 3,0 y1; eruption=0.687; active=true; campaign year 3 eruption destroyed Flour Mill |
| 1.2.13.59 | Lava flows | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/world/volcano-hazards.js#updateVolcanoHazards | 3,0 y1; lavaFlow=0.620; destruction=0.642; campaign destroyed Flour Mill and rebuilt Flour Mill, Sawmill |
| 1.2.13.60 | Ashfall | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/world/volcano-hazards.js#updateVolcanoHazards | 3,0 y1; ash=0.481; campaign ashfall=ERUPTION IN STEEP ASH CONE · ASH 60% ASHFALL BURIES THE PASTURE · FOOD -1 DESTROYED BUILDING; drawAshPlume |
| 1.2.13.61 | Toxic volcanic gases | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/world/volcano-hazards.js#updateVolcanoHazards | 22,0 y1; toxicGas=0.642; combat.js gas loss + work exposure |
| 1.2.13.62 | Earthquakes | **working** | js/world/volcano-hazards.js#updateVolcanoHazards + js/systems/roads.js#destroyRoad | 18,0; earthquake=0.694; campaign quake destroyed Sawmill at year 4; stone loss |
| 1.2.13.63 | Hot springs and unstable ground | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/world/volcano-hazards.js#updateVolcanoHazards | 4,0 y1; hotSpring=0.573; unstable=0.365; movement=0.758 |
| 1.2.13.64 | Rockfall | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/world/volcano-hazards.js#updateVolcanoHazards | 156,12 y1; rockfall=0.440; combat.js ROCKFALL damage |
| 1.2.13.65 | Long-term uninhabitable areas | **working** | js/systems/construction.js#volcanicSiteVerdictAt + js/world/volcano-ecology.js#volcanoProfileAt | 3,0 y1; uninhabitable=0.860; build verdict=blocked |
| 1.2.13.66 | Destruction of settlements and infrastructure | **working** | js/world/volcano-hazards.js#updateVolcanoHazards + js/systems/roads.js#destroyRoad | 3,0 y1; destruction=0.642; campaign real buildings destroyed=Flour Mill, Sawmill; rebuilt=Flour Mill, Sawmill; recovery=complete |
| 1.2.13.67 | Colonisation and growth on old lava | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/systems/construction.js#volcanicSiteVerdictAt | 2,0 y1; oldLava=0.499; stage=shrub; regeneration=0.489 |
| 1.2.13.68 | Slow soil formation | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/systems/construction.js#volcanicSiteVerdictAt | 0,0 y1; soilAge=0.530; soil.formation=0.674; ageYears=138 |
| 1.2.13.69 | Formation of new watercourses | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/systems/construction.js#volcanicSiteVerdictAt | 4,0 y1; newChannel=0.635; drawWatercourse; water=0.584 |
| 1.2.13.70 | Change of the crater landscape | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/systems/construction.js#volcanicSiteVerdictAt | 107,17 y1; active=true; cycle=0.056; crater=0.533; drawCrater lava lake |
| 1.2.13.71 | Vegetation regeneration after eruptions | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/systems/construction.js#volcanicSiteVerdictAt | 0,0 y1; stage=grass; yearsSinceEruption=7; vegetation=0.126 |
| 1.2.13.72 | Formation of new mineral resources | **working** | js/world/volcano-ecology.js#volcanoProfileAt + js/systems/construction.js#volcanicSiteVerdictAt | 3,0 y1; minerals=0.377; rare=0.315; goods=iron-ore,copper-ore,pumice,volcanic-minerals |
| 1.2.13.73 | Long-term changes in land usability | **working** | js/systems/construction.js#volcanicSiteVerdictAt + js/world/volcano-ecology.js#volcanoProfileAt | 0,0 y1; usability=0.552; verdict=old ground buildable; observatory=built at 100,9 |

## Cross-checks

- Browser capture: `node tests/browser/volcano-formations.mjs` — 10/10 formations, seed 20261212, no page or console errors.
- Low-end volcanic run: `PERF_SOFTWARE_CANVAS=1 PERF_CLIMATE=volcanic PERF_FORESTS=55 PERF_SEED=20261212 PERF_YEARS=2 PERF_RENDER_SCALE=70 node tests/browser/low-end-performance.mjs` — 16.7–16.8 ms p95, 0 long tasks, save 176.5 ms, load 1503.7 ms, 970,822 bytes.
- Multi-year campaign: `node scripts/volcano-campaign.mjs` — 9-year volcanic settlement campaign at seed 20260004: Flour Mill lost to eruption, Sawmill lost to earthquake, rebuilt Flour Mill, Sawmill; recovery=complete.

## Multi-year settlement campaign

The campaign starts the shipped realm in the volcanic climate and runs nine years of ordinary fixed-step simulation, including city needs, construction sites, carrier logistics, fields, weather, population, events and the annual hazard task. Year 3 invokes the real annual eruption branch; year 4 invokes the real annual earthquake branch. The destroyed entities are then rebuilt through `placeDirectBuilding()` and must reach stage 3 before the audit passes.

| Year | Cause | Event log | Destroyed target | Buildings before → after |
|---|---|---|---|---|
| 3 | eruption | ERUPTION IN STEEP ASH CONE · ASH 60% / ASHFALL BURIES THE PASTURE · FOOD -1 / DESTROYED BUILDING | Flour Mill at 97,96 | 29 → 28 |
| 4 | earthquake | EARTH TREMOR SHAKES STEEP ASH CONE · 60% / COLLAPSED BUILDING | Sawmill at 101,90 | 27 → 26 |

| Cause | Original | Rebuilt entity | Site | Placed | Completed |
|---|---|---|---|---|---|
| eruption | Flour Mill | ec28pw-1m | 97,96 (same tile) | year 5 | year 6 |
| earthquake | Sawmill | ec28pw-1n | 101,90 (same tile) | year 5 | year 6 |

| Year | Tick | Population | Buildings | Food | Active sites | Rebuilt structures complete |
|---|---|---|---|---|---|---|
| 1 | 0 | 23 | 30 | 120 | 0 | 0/0 |
| 2 | 400 | 24 | 29 | 217.68 | 0 | 0/0 |
| 3 | 800 | 24 | 28 | 348.05 | 0 | 0/0 |
| 4 | 1200 | 24 | 26 | 450.43 | 0 | 0/0 |
| 5 | 1600 | 24 | 27 | 291.81 | 2 | 0/2 |
| 6 | 2000 | 24 | 26 | 257.23 | 0 | 2/2 |
| 7 | 2400 | 22 | 25 | 369.02 | 0 | 2/2 |
| 8 | 2800 | 22 | 24 | 388.52 | 0 | 2/2 |
| 9 | 3200 | 22 | 23 | 582.03 | 0 | 2/2 |

Final state: population 22, buildings 23, food 582.03, recovery complete.

## Work and gathering probes

```json
{
  "works": {
    "lavaQuarry": {
      "ok": true,
      "x": 105,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [
        {
          "id": "basalt",
          "amount": 6
        }
      ],
      "reason": null
    },
    "obsidianQuarry": {
      "ok": true,
      "x": 108,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [
        {
          "id": "obsidian",
          "amount": 5
        },
        {
          "id": "crater-crystal",
          "amount": 1
        }
      ],
      "reason": null
    },
    "pumiceQuarry": {
      "ok": true,
      "x": 100,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [
        {
          "id": "pumice",
          "amount": 7
        }
      ],
      "reason": null
    },
    "sulfurMine": {
      "ok": true,
      "x": 63,
      "y": 18,
      "label": "Volcanic crater field",
      "formation": "crater-field",
      "goods": [
        {
          "id": "sulfur",
          "amount": 7
        },
        {
          "id": "volcanic-minerals",
          "amount": 3
        }
      ],
      "reason": null
    },
    "metalMine": {
      "ok": true,
      "x": 100,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [
        {
          "id": "iron-ore",
          "amount": 4
        }
      ],
      "reason": null
    },
    "mineralWorks": {
      "ok": true,
      "x": 100,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [
        {
          "id": "volcanic-minerals",
          "amount": 7
        }
      ],
      "reason": null
    },
    "geothermalPlant": {
      "ok": true,
      "x": 100,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [
        {
          "id": "geothermal-energy",
          "amount": 3
        },
        {
          "id": "hot-spring-water",
          "amount": 4
        }
      ],
      "reason": null
    },
    "fertileTerrace": {
      "ok": true,
      "x": 100,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [
        {
          "id": "volcanic-soil",
          "amount": 5
        }
      ],
      "reason": null
    },
    "craterExpedition": {
      "ok": true,
      "x": 100,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [
        {
          "id": "crater-crystal",
          "amount": 2
        },
        {
          "id": "volcanic-minerals",
          "amount": 2
        }
      ],
      "reason": null
    },
    "observatory": {
      "ok": true,
      "x": 100,
      "y": 9,
      "label": "Lava field",
      "formation": "lava-field",
      "goods": [],
      "reason": null
    }
  },
  "gather": {
    "x": 107,
    "y": 17,
    "formation": "steep-cone",
    "ok": true,
    "goods": [
      {
        "id": "basalt",
        "amount": 3
      },
      {
        "id": "hot-spring-water",
        "amount": 2
      },
      {
        "id": "pumice",
        "amount": 2
      },
      {
        "id": "geothermal-energy",
        "amount": 2
      },
      {
        "id": "volcanic-minerals",
        "amount": 2
      }
    ],
    "reason": null
  }
}
```

## Hazard and construction probes

```json
{
  "hazard": {
    "target": {
      "x": 3,
      "y": 0,
      "formation": "shield-volcano",
      "destruction": 0.6423199585390394
    },
    "eruption": {
      "events": [
        "ERUPTION IN BROAD SHIELD VOLCANO · ASH 48%",
        "ASHFALL BURIES THE PASTURE · FOOD -1",
        "DESTROYED BUILDING"
      ],
      "destroyed": {
        "ok": true,
        "kind": "building",
        "label": "Timber Cottage",
        "x": 3,
        "y": 0
      },
      "candidates": 19,
      "eruption": {
        "x": 3,
        "y": 0,
        "destruction": 0.6423199585390394
      },
      "earthquake": {
        "x": 3,
        "y": 0,
        "magnitude": 0.4910014595251996
      }
    },
    "houseDead": true,
    "quakeTarget": {
      "x": 18,
      "y": 0,
      "earthquake": 0.6937845039942768
    },
    "quake": {
      "ok": true,
      "kind": "building",
      "label": "Timber Cottage",
      "x": 18,
      "y": 0
    },
    "quakeHouseDead": true
  },
  "construction": {
    "hostile": {
      "x": 3,
      "y": 0,
      "ok": false,
      "reason": "UNINHABITABLE VOLCANIC GROUND",
      "uninhabitable": 0.860156230381094,
      "usability": 0.20449693754148712,
      "freshLava": 0.945970426393021
    },
    "young": {
      "x": 9,
      "y": 0,
      "ok": false,
      "reason": "YOUNG LAVA HAS NOT YET BECOME SETTLEMENT GROUND",
      "uninhabitable": 0.6569520298520732,
      "usability": 0.27481941982180824,
      "freshLava": 0.7772168801869859
    },
    "old": {
      "x": 0,
      "y": 0,
      "ok": true,
      "reason": null,
      "uninhabitable": 0,
      "usability": 0.5914487833650381,
      "freshLava": 0.07217966343340919
    }
  }
}
```
