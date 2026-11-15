# Volcanoes 1.2.13

Volcanic Lands are a real twelfth climate, not a lava-coloured overlay on the
temperate map. One deterministic profile derived from seed, position, height,
moisture, temperature, season, weather and land use feeds the terrain bake,
the detail renderer, gathering, works, movement and combat. There is no second
tick loop, no per-tile save payload and no parallel resource ledger.

## Implementation

- **Ecology:** `game/js/world/volcano-ecology.js` exports
  `volcanoProfileAt()`, `isVolcanoSite()`, `volcanoRequirementAudit()`,
  `VOLCANO_REQUIREMENTS`, ten named formations and the shared volcanic goods.
  The profile carries cone, shield, crater, caldera, fissure, lava flow,
  fresh and weathered lava, basalt, pumice, obsidian, spires, ash, sulfur,
  mineral deposits, hot rock, fumaroles, steam, hot springs, geysers, mud
  pools, soil age and regeneration stage.
- **Climate:** `volcanic` is selectable as **Volcanic Lands** in the world
  creation panel. `terrain-model.js` supplies its palette, height, moisture and
  temperature curves; `season.js` supplies its seasonal profile; `world.js` adds
  volcanic relief and hillshade. Existing saves keep their climate.
- **Formations (1.2.13.1–1.2.13.18):** single cone, large crater, crater field,
  shield volcano, steep cone, caldera, fissure field, volcanic chain, extinct
  weathered volcano, fresh lava field, old weathered lava, cooled lava flows,
  basalt, pumice fields, obsidian, rock spires, broken rock and varied lava
  colour and texture. `volcanoProfileAt()` is their single source; landform
  values vary continuously across a field rather than switching a whole map to
  one stamp.
- **Activity (1.2.13.19–1.2.13.34):** smoking craters, steam vents, glowing
  lava, small flows, ash emission, sulfur, hot rock, ground cracks, hot springs,
  geysers, fumaroles, sulfur springs, mineral crusts, mud pools, geothermally
  warmed water and steaming ground. Eruption cycles derive from seed and year,
  so the same save always erupts at the same time without an extra timer.
- **Regeneration (1.2.13.35–1.2.13.48):** bare young lava, lichen and moss,
  pioneer plants, weathered-soil grasses, older scrub, fertile volcanic soil,
  mixed regeneration stages, heat- and drought-adapted plants, reptiles, birds,
  insects, mammals on old flows, crevice dwellers and specialised hot-mineral
  fauna. Each stage is a threshold on the same profile, not a separate map.
- **Goods (1.2.13.49–1.2.13.57):** basalt, volcanic stone, obsidian, pumice,
  sulfur, metal ore, mineral deposits, geothermal energy, fertile volcanic soil
  and rare crater materials enter `FOREST_GOODS`, the item lexicon, the shared
  gathering ledger and the existing delivery channels.
- **Hazards (1.2.13.58–1.2.13.66):** `volcano-hazards.js` runs one bounded
  annual pass over at most 96 candidates: occupied buildings, volcanic works,
  sampled roads and wild ground. An active eruption or earthquake on occupied
  ground marks a real building dead or removes a real road through
  `destroyRoad()`, clears worker assignments, invalidates collision, consumes
  food under ashfall and stone under tremor, and writes the loss to the shared
  chronicle. Keeps and wonders are deliberately protected from destruction and
  exempt from the placement frontier. The scan runs only at the year boundary,
  never in the frame loop. `resource-geography.js` caches a
  volcanic movement cost and tactical profile; `combat.js` applies gas and
  rockfall losses plus local movement and defence modifiers. Requirement 66 is
  therefore a real state change, not a pre-seeded checklist flag.
- **Long-term change (1.2.13.67–1.2.13.73):** colonisation of old lava, slow
  soil formation, new watercourses, changing crater landscapes, post-eruption
  vegetation recovery, new mineral resources and changing long-term usability
  are all derived from the same age, eruption and regeneration profile.
- **Works:** `game/js/world/volcano-works.js` adds ten player-built works on
  completed buildings: lava quarry, obsidian quarry, pumice quarry, sulfur
  mine, metal mine, mineral works, geothermal plant, fertile terrace, crater
  expedition and observatory. Each spends real goods, marks a bounded work tile,
  repaints the terrain, feeds the shared ledger and respects a per-tile recovery
  cooldown. Ecological gates read the same economy fields as the profile: a
  sulfur mine without `economy.sulfur` is rejected, and a successful sulfur mine
  delivers actual sulfur rather than a phantom action. The panel reuses the
  existing works UI rather than adding a new management screen.
- **Rendering:** `game/js/presentation/rendering/volcano-render.js` draws the
  baked ground as-is and adds discrete, bounded detail: cones, craters,
  calderas, open fissures, cooled clinker, glowing cracks, steam, hot pools,
  yellow sulfur, pale mineral veins, cave mouths, new watercourses, ash plumes,
  hot-rock cracks, flora, fauna, work marks and volcanic tree forms. Landmark
  occupancy is deterministic, so panning cannot pop a cone in or out; deep
  craters are still drawn on non-landmark tiles so an active lava lake cannot
  disappear. Capped loops and visible-tile-only work keep low-end frames inside
  budget.
- **Persistence:** save schema 11 gains an optional bounded `volcanoWorks`
  block. `state.js`, `save-validation.js` and `save-runtime.js` serialize,
  validate and restore it; old saves without the block load unchanged.
- **UI and survey:** `grassland-use.js` recognizes volcanic work flags, and the
  existing land-use survey reports volcanic products, hazards and works. The
  volcanic option and work actions are covered by the normal UI smoke checks.

## Requirements

All 73 identifiers are declared exactly once in `VOLCANO_REQUIREMENTS` and are
audited by `volcanoRequirementAudit()`. The deterministic survey covers all ten
formations and every natural feature; the built-profile survey reaches all ten
works. Requirement 66 only passes with real damage evidence, not with a
pre-seeded flag.

## Runtime audit

`scripts/volcano-audit.mjs` generates a real 176×176 volcanic world (seed
`20261212`), surveys all 30,976 volcanic tiles, and then exercises the actual
work, gathering, hazard and construction paths. It writes
[`../../artifacts/VOLCANO_1.2.13_AUDIT.md`](../../artifacts/VOLCANO_1.2.13_AUDIT.md)
and `../../artifacts/volcano-audit.json`: every one of the 73 items has a status,
code location, a representative tile with its real profile values and, where
applicable, the observed work output, hazard destruction, gather result or
construction verdict. All 73 current entries are `working`; the audit script
exits nonzero if a work, earthquake, destruction or construction probe fails.

## Verification

- Focused volcanic tests: `tests/world/volcano-ecology.test.js`,
  `tests/world/volcano-works.test.js` and `tests/world/volcano-hazards.test.js`,
  **18/18** green.
- Full suite: **1022/1022** green, syntax/imports **158 files**, **201 UI ids**,
  zero failures.
- Browser reference: `tests/browser/volcano-formations.mjs` founded seed
  `20261212`, captured all ten formations and wrote
  `../../artifacts/volcano-formations.png` plus a 220 px-per-cell formation atlas.
  The run reported **10/10** formations and no page or console errors.
- Low-end profile: 4× CPU throttle, software Canvas, 70% render scale, 55%
  forests, seed `20261212`, two years. All five phases held **16.7–16.8 ms
  p95**, with **zero long tasks**. Save took **176.5 ms** and load **1503.7 ms**
  for a 970,822-byte realm; there were no page or console errors.
- Deterministic 25-year campaign: **10,040 ticks**, **13/13 ambitions**,
  **0.752 ms per tick**, no stalled sites and no game over.

## Notes

The twelve-climate terrain-depth test was updated from eleven to twelve. Volcanic
climate selection, save/restore and work construction stay on the existing
paths; no renderer, economy or clock was added alongside them.
