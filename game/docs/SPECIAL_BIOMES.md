# Fantastic & Rare Biomes (1.2.16)

**Status:** implemented, tested and on the production line.
**Point manifest:** 100 explicit entries, `1.2.16.1–1.2.16.100`.
**Related:** [Endless Realm](ENDLESS_REALM.md), [Terrain performance](TERRAIN_PERFORMANCE.md), [Expeditions](EXPEDITIONS.md).

This is the requested **1.2.16** fantastic-biome list: nine playable families,
plus eleven explicit atlas and integration points. The repository's earlier
Winter Economy & Ice Roads ledger keeps its own 1.2.16.1–20 system identifiers
in [SNOWLANDS.md](SNOWLANDS.md); this document is the player-facing atlas
manifest requested here.

## What was added

A rare region is a data-driven part of the living world, not a painted decal or
a separate map. It has real terrain, a tint, landmark anchors, a rare good, an
annual yield, a hazard, a discovery event, an attunement choice and a permanent
place in the save.

- **Nine families:** Enchanted Wood, Crystal Land, Fungal Wilds, Blighted Land,
  Glass Desert, Mist Moor, Ash Shadow, Hollow Depths and Magic Mountains.
- **One hundred manifest points:** from unusual tree colours and glowing
  clearings through crystal caves, floating rock, moor lights, ashfall,
  underground forests, impossible peaks and finally atlas/integration work.
- **Rare goods:** Aether herbs, crystal shards, glowcaps, blight resin, glass
  sand, moor pearls, ash iron, deep amber and star metal.
- **Bounded atlas:** at most twelve regions, each with five to nine feature
  anchors and up to three satellite islets.
- **Real choices:** three units of a region's rare good permanently attune it;
  blighted regions must be cleansed (3 resin + 12 gold) before attunement; rare
  goods can be sold for gold instead.

## Architecture

| Layer | File | Responsibility |
|---|---|---|
| Pure atlas | `js/world/special-biomes.js` | Families, 100-point manifest, seeded region placement, satellite islets, feature anchors, one-byte tile map, tint and summary helpers. |
| Persistent state | `js/systems/special-biome-state.js` | Discovery every 200 ticks, annual yields and hazards, attunement, cleansing, rare-good trade, normalization, validation and snapshots. |
| Cross-system couplings | `js/systems/special-biome-couplings.js` | One cached atlas influence profile, local combat cover, survey/rite/omen quests, blight decrees and the bounded coupling save block. |
| World generation | `js/world/world.js` | Generates the atlas from the same seed and terrain samples as the normal biomes; bakes the low-resolution tint into the terrain surface. |
| Simulation | `js/simulation/simulation.js` | One bounded call per tick. No tile scan and no new O(n²) loop. |
| Rendering | `js/presentation/rendering/special-biome-render.js` | Culled cmd/landmark overlay on top of fog; one anchor per feature, not one object per tile. |
| Explore UI | `js/presentation/expeditions-panel.js` | Family progress, rare-good ledger and trade, charted region cards, Attune/Cleanse actions and the atlas journal. |
| Save | `js/core/save-runtime.js`, `js/core/save-validation.js` | Additive schema-11 block with normalization and structural validation. |

The generated atlas stores only region DTOs. The tile lookup is a single
`Uint8Array(W × H)` rebuilt from region centres and satellite islets. A map
tile stores the region index plus one; `0` means ordinary terrain. That keeps
lookup O(1) and the save small (regions and counters, never the tile array).

### Determinism

Placement uses the world seed, five terrain samples per candidate, a family
score derived from height/moisture/climate, and a remembered-history profile
(age, strife, magic, geology). The profile uses explicit history/geology data
when the world provides it and otherwise derives a stable memory from the seed.
The same seed, options and terrain always produce the same region IDs,
coordinates, families, radii, satellites, feature anchors and resources. The
focused test generates the same atlas twice and compares every field.

### Annual ecology

- Discovery is checked every 200 ticks against the explored tiles around a
  region centre and its feature anchors. A discovered region logs one chronicle
  event and enters the survey.
- Each discovered region yields its rare good once per game year. An attuned
  region yields double.
- A blighted region gains pressure each year (capped at 6), damages morale when
  it is near the realm heart, and emits pressure warnings at 2, 4 and 6.
- One deterministic hazard roll per year can cost morale, wood or gold across
  the whole atlas. Fungal, blight, moor, ash and cave hazards can also seed a
  real named outbreak in the existing health system. Attunement and cleansing
  are routes to recovery.
- Discovery and annual work are bounded by the twelve-region cap; no per-tile
  simulation is involved.

## Cross-system couplings

The atlas is not an isolated panel. `special-biome-couplings.js` turns the
region list and rare-good ledger into one cached influence profile. It is
rebuilt only when the atlas, a quest choice, a trade or an annual pass changes;
normal reads are O(1).

- **Diplomacy:** every neighbouring court receives the cached relation drift;
  guild, clergy, commons and nobility effects reach the faction ledger and
  rare-good trade improves the annual relation.
- **Warfare:** `getBiomeCombatModifiersAt(x, y)` performs one atlas byte lookup.
  Charted cover reduces incoming raid damage, attunement strengthens defenders,
  and blight or ash bleeds attackers through bounded attrition.
- **City and economy:** harvest factor, building efficiency and mature-realm
  growth slots read the same profile. The growth slot is added only after the
  existing water, safety, satisfaction, food and housing gates pass.
- **Administration:** blight pressure raises realm-cycle scarcity/unrest and
  exposes a costed royal decree. Quarantine, purge, study and ignore have
  different real costs and consequences; an unanswered decree spreads the rot.
- **Quests:** discovery opens a survey; attuning opens a rite; magic mountains
  and mist moors can open an omen. Resolving a quest spends real food, gold or
  a rare good and changes morale, legitimacy, resources or the chronicle.
- **Bounded state:** six active quests, twelve archived quests, twelve history
  rows and one blight decree. All of it lives inside the existing special-biome
  save block, so old atlas saves gain a fresh coupling block automatically.

## Nine families

| Family | Rare good | Boon | Hazard |
|---|---|---|---|
| Enchanted Wood | Aether herbs (9 gold) | The wood answers its warden: morale and herb-gathering improve. | Uncanny lights lead travellers astray when the veil thins. |
| Crystal Land | Crystal shards (12 gold) | Crystal light clarifies stonework, trade and the court's sight. | Splinter fields cut feet and horses; light can blind the unwary. |
| Fungal Wilds | Glowcaps (8 gold) | A rich fungal harvest feeds the realm and yields medicine. | Spore clouds cause fever, confusion and failed harvests. |
| Blighted Land | Blight resin (7 gold) | The wound can be studied, cleansed or turned into a grim ward. | Corruption spreads to neighbouring land, poisoning water and beasts. |
| Glass Desert | Glass sand (10 gold) | Glass and gem trade brings coin, but the shards demand respect. | Razor ground wounds workers; mirrored heat disorients travellers. |
| Mist Moor | Moor pearls (11 gold) | Moor herbs and pearls sustain the realm through hard years. | The mist hides paths, islands and the lights that lure travellers. |
| Ash & Shadow | Ash iron (10 gold) | Ash iron and fire-hardened wood make unusually strong tools. | Ashfall smothers fields and lungs; the ground remembers heat. |
| Hollow Depths | Deep amber (13 gold) | Cave amber, blind fish and old stone enrich the realm's crafts. | Collapses, blind predators and gas pockets make the deep hostile. |
| Magic Mountains | Star metal (16 gold) | Star metal and mountain springs transform crafts and legitimacy. | Unnatural weather, thin air and tumbling stone make access deadly. |

## The 100-point manifest

Each row is an explicit implementation or integration point. Rows 1.2.16.85–90
are the atlas/discovery contract; rows 1.2.16.91–100 are the cross-system
integration contract. Rows 1–84 map to real families and feature kinds.

### 1.2.16.1–1.2.16.10 · Enchanted Wood

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.1 | Enchanted forests | Luminous grove — glowtree landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.2 | Trees with unusual colours | Colour-shifting trees — prismleaf landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.3 | Glowing plants | Glowing undergrowth — glade landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.4 | Magical clearings | Moonlit clearing — glowcap landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.5 | Rare tree species | Rare old trees — spring landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.6 | Unusual blossoms | Unusual blossoms — runestone landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.7 | Glowing mushrooms | Glowing mushrooms — glowtree landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.8 | Special woodland animals | Woodland spirits — prismleaf landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.9 | Magical springs and places of power | A spring of power — glade landmark, Aether herbs, Enchanted Wood region |
| 1.2.16.10 | Vegetation that reacts to magical influence | A living ley-line — glowcap landmark, Aether herbs, Enchanted Wood region |

### 1.2.16.11–1.2.16.19 · Crystal Land

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.11 | Crystal landscapes | Great crystal formation — crystal-grove landmark, Crystal shards, Crystal Land region |
| 1.2.16.12 | Great crystal formations | Crystal grove — mineral-field landmark, Crystal shards, Crystal Land region |
| 1.2.16.13 | Crystal forests | Mineral field — glass-rock landmark, Crystal shards, Crystal Land region |
| 1.2.16.14 | Mineral fields | Translucent coloured rock — crystal-cave landmark, Crystal shards, Crystal Land region |
| 1.2.16.15 | Transparent or coloured rock structures | Crystal cave — vein landmark, Crystal shards, Crystal Land region |
| 1.2.16.16 | Crystal caves | Glowing mineral vein — crystal landmark, Crystal shards, Crystal Land region |
| 1.2.16.17 | Glowing mineral veins | Rare crystal resource — crystal-grove landmark, Crystal shards, Crystal Land region |
| 1.2.16.18 | Rare crystal resources | A hall of reflected light — mineral-field landmark, Crystal shards, Crystal Land region |
| 1.2.16.19 | Special light reflections | Crystal landscape — crystal landmark, Crystal shards, Crystal Land region |

### 1.2.16.20–1.2.16.28 · Fungal Wilds

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.20 | Mushroom forests | Giant mushrooms — giant-mushroom landmark, Glowcaps, Fungal Wilds region |
| 1.2.16.21 | Giant mushrooms | Glowing colonies — fungal-colony landmark, Glowcaps, Fungal Wilds region |
| 1.2.16.22 | Glowing fungal colonies | Dense fungal carpet — fungal-carpet landmark, Glowcaps, Fungal Wilds region |
| 1.2.16.23 | Dense fungal carpets | Underground mycelial network — spore-cloud landmark, Glowcaps, Fungal Wilds region |
| 1.2.16.24 | Underground mycelial networks | Great spore clouds — healing-mushroom landmark, Glowcaps, Fungal Wilds region |
| 1.2.16.25 | Great spore clouds | Healing and poisonous caps — mushroom landmark, Glowcaps, Fungal Wilds region |
| 1.2.16.26 | Rare healing and poisonous mushrooms | Fungal fauna — giant-mushroom landmark, Glowcaps, Fungal Wilds region |
| 1.2.16.27 | Specialised fungal animals | Strange soil — fungal-colony landmark, Glowcaps, Fungal Wilds region |
| 1.2.16.28 | Unusual soil structures | Mushroom forest — mushroom landmark, Glowcaps, Fungal Wilds region |

### 1.2.16.29–1.2.16.38 · Blighted Land

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.29 | Cursed and corrupted landscapes | Black and discoloured plants — black-grass landmark, Blight resin, Blighted Land region |
| 1.2.16.30 | Dead trees | Rotten ground — rot-pool landmark, Blight resin, Blighted Land region |
| 1.2.16.31 | Black or discoloured plants | Unnatural fog — unnatural-fog landmark, Blight resin, Blighted Land region |
| 1.2.16.32 | Rotten ground | Poisoned water — twisted-beast landmark, Blight resin, Blighted Land region |
| 1.2.16.33 | Unnatural fog | Changed animals — spreading-zone landmark, Blight resin, Blighted Land region |
| 1.2.16.34 | Poisoned water | A spreading corruption — deadwood landmark, Blight resin, Blighted Land region |
| 1.2.16.35 | Changed animal species | A curse or supernatural danger — black-grass landmark, Blight resin, Blighted Land region |
| 1.2.16.36 | Spreading corruption zones | A creeping boundary — rot-pool landmark, Blight resin, Blighted Land region |
| 1.2.16.37 | Magical or supernatural dangers | Dead trees — deadwood landmark, Blight resin, Blighted Land region |
| 1.2.16.38 | Long-term change in neighbouring biomes | Black and discoloured plants — black-grass landmark, Blight resin, Blighted Land region |

### 1.2.16.39–1.2.16.47 · Glass Desert

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.39 | Crystal deserts and glass landscapes | Mirroring rock — mirror-rock landmark, Glass sand, Glass Desert region |
| 1.2.16.40 | Glass-like sand | Mineral columns — mineral-column landmark, Glass sand, Glass Desert region |
| 1.2.16.41 | Crystalline dunes | Rare gemstones — gem landmark, Glass sand, Glass Desert region |
| 1.2.16.42 | Mirroring rock formations | Shifting refraction — sharp-ground landmark, Glass sand, Glass Desert region |
| 1.2.16.43 | Mineral columns | Dry vegetation — glass landmark, Glass sand, Glass Desert region |
| 1.2.16.44 | Rare gemstone deposits | Dangerously sharp ground — crystal-dune landmark, Glass sand, Glass Desert region |
| 1.2.16.45 | Special light refraction | A false horizon — mirror-rock landmark, Glass sand, Glass Desert region |
| 1.2.16.46 | Extremely dry vegetation | Glass-like sand — glass landmark, Glass sand, Glass Desert region |
| 1.2.16.47 | Dangerous sharp surfaces | Crystalline dunes — crystal-dune landmark, Glass sand, Glass Desert region |

### 1.2.16.48–1.2.16.56 · Mist Moor

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.48 | Magical mist moors | A path that loses itself — glowreed landmark, Moor pearls, Mist Moor region |
| 1.2.16.49 | Permanent mist layers | Permanent mist banks — mist landmark, Moor pearls, Mist Moor region |
| 1.2.16.50 | Glowing water plants | Glowing water plants — glowreed landmark, Moor pearls, Mist Moor region |
| 1.2.16.51 | Unusual moor lights | Unusual marsh lights — moorlight landmark, Moor pearls, Mist Moor region |
| 1.2.16.52 | Rare herbs | Rare herbs — moor-herb landmark, Moor pearls, Mist Moor region |
| 1.2.16.53 | Magical springs | A magical spring — moor-spring landmark, Moor pearls, Mist Moor region |
| 1.2.16.54 | Hidden islands | Hidden islands — hidden-island landmark, Moor pearls, Mist Moor region |
| 1.2.16.55 | Altered animal species | Changed waterfowl — mist landmark, Moor pearls, Mist Moor region |
| 1.2.16.56 | Phenomena that make orientation difficult | A path that loses itself — glowreed landmark, Moor pearls, Mist Moor region |

### 1.2.16.57–1.2.16.65 · Ash & Shadow

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.57 | Ash and shadow landscapes | Charred tree remains — black-grass landmark, Ash iron, Ash & Shadow region |
| 1.2.16.58 | Dark soils | Black grasses — ashfall landmark, Ash iron, Ash & Shadow region |
| 1.2.16.59 | Charred tree remains | Ash rain — strange-rock landmark, Ash iron, Ash & Shadow region |
| 1.2.16.60 | Black grasses | Strange rock formations — ash-vein landmark, Ash iron, Ash & Shadow region |
| 1.2.16.61 | Ash rain | Changed light — ash landmark, Ash iron, Ash & Shadow region |
| 1.2.16.62 | Strange rock formations | Hardy plants — charred-tree landmark, Ash iron, Ash & Shadow region |
| 1.2.16.63 | Changed light | Rare mineral wealth — black-grass landmark, Ash iron, Ash & Shadow region |
| 1.2.16.64 | Resilient plants | Ashen and shadowed landscape — ash landmark, Ash iron, Ash & Shadow region |
| 1.2.16.65 | Rare mineral raw materials | Dark soils — charred-tree landmark, Ash iron, Ash & Shadow region |

### 1.2.16.66–1.2.16.75 · Hollow Depths

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.66 | Underground biomes | Crystal cave — underground-lake landmark, Deep amber, Hollow Depths region |
| 1.2.16.67 | Large cave systems | Subterranean lake — fungal-garden landmark, Deep amber, Hollow Depths region |
| 1.2.16.68 | Underground forests | Fungal landscape — glowworm landmark, Deep amber, Hollow Depths region |
| 1.2.16.69 | Crystal grottoes | Glowing organisms — underground-river landmark, Deep amber, Hollow Depths region |
| 1.2.16.70 | Underground lakes | Underground river — cave-mouth landmark, Deep amber, Hollow Depths region |
| 1.2.16.71 | Fungal landscapes | Blind fauna and pale flora — underground-forest landmark, Deep amber, Hollow Depths region |
| 1.2.16.72 | Glowing organisms | Rare stone and gas — underground-lake landmark, Deep amber, Hollow Depths region |
| 1.2.16.73 | Underground rivers | Large cave system — cave-mouth landmark, Deep amber, Hollow Depths region |
| 1.2.16.74 | Unique animals and plants | Underground forest — underground-forest landmark, Deep amber, Hollow Depths region |
| 1.2.16.75 | Special resources and dangers | Crystal cave — underground-lake landmark, Deep amber, Hollow Depths region |

### 1.2.16.76–1.2.16.84 · Magic Mountains

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.76 | Magical mountains | Crystal peaks — mountain-spring landmark, Star metal, Magic Mountains region |
| 1.2.16.77 | Floating or unusually shaped rock formations | A spring of power — strange-weather landmark, Star metal, Magic Mountains region |
| 1.2.16.78 | Glowing mountain veins | Unnatural weather — alpine-beast landmark, Star metal, Magic Mountains region |
| 1.2.16.79 | Crystal peaks | Rare alpine plants and beasts — floating-rock landmark, Star metal, Magic Mountains region |
| 1.2.16.80 | Springs of power | Precious stone — mountain-vein landmark, Star metal, Magic Mountains region |
| 1.2.16.81 | Unnatural weather phenomena | A pass that closes itself — crystal-peak landmark, Star metal, Magic Mountains region |
| 1.2.16.82 | Rare plants and animals | Magical mountains — floating-rock landmark, Star metal, Magic Mountains region |
| 1.2.16.83 | Special raw materials | Floating or impossible rock — mountain-vein landmark, Star metal, Magic Mountains region |
| 1.2.16.84 | Difficult and dangerous access | Glowing mountain veins — crystal-peak landmark, Star metal, Magic Mountains region |

### 1.2.16.85–1.2.16.90 · Atlas and discovery integration

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.85 | Rare distribution of special biomes | Atlas contract: manifest entry, deterministic region data, discovery, rare-good ledger, survey UI, save round-trip |
| 1.2.16.86 | Distribution tied to world history, climate, magic and geology | Atlas contract: manifest entry, deterministic region data, discovery, rare-good ledger, survey UI, save round-trip |
| 1.2.16.87 | Small and large special-biome areas | Atlas contract: manifest entry, deterministic region data, discovery, rare-good ledger, survey UI, save round-trip |
| 1.2.16.88 | Individual special-biome islands inside ordinary landscapes | Atlas contract: manifest entry, deterministic region data, discovery, rare-good ledger, survey UI, save round-trip |
| 1.2.16.89 | Transitions to normal biomes | Atlas contract: manifest entry, deterministic region data, discovery, rare-good ledger, survey UI, save round-trip |
| 1.2.16.90 | Regional and procedurally generated variants | Atlas contract: manifest entry, deterministic region data, discovery, rare-good ledger, survey UI, save round-trip |

### 1.2.16.91–1.2.16.100 · Cross-system integration

| # | Point | Implemented as |
|---|---|---|
| 1.2.16.91 | Special discovery and exploration events | A charted region opens a survey, a chronicle entry and an Explore discovery event; the survey is remembered in the save. |
| 1.2.16.92 | Integration into quests, legends and historical events | Discovery/attunement open survey, rite and omen quests; every result enters the bounded atlas history and the realm chronicle. |
| 1.2.16.93 | Special resources | Nine rare goods yield once per discovered region per year; attuned regions yield double. |
| 1.2.16.94 | Rare building and crafting materials | Rare goods are real inventory used by attunement, cleansing and quest choices, and sold in the Explore market for gold. |
| 1.2.16.95 | Unique animal species | Each family has its own fauna feature anchors, variants and lore (spirits, twisted beasts, blind fauna, alpine beasts). |
| 1.2.16.96 | Special diseases and environmental hazards | Annual hazards cost morale/wood/gold; fungal, blight, moor, ash and cave hazards can seed a named outbreak in the health system. |
| 1.2.16.97 | Magical advantages or disadvantages | The cached influence profile grants family-specific boons and penalties to diplomacy, combat, city output, growth and realm stability. |
| 1.2.16.98 | Special settlement conditions | Attuned regions add mature-realm growth slots only after the water, safety, satisfaction, food and housing gates pass. |
| 1.2.16.99 | Special trade opportunities | The Explore market sells every rare good at its family value; trade improves annual diplomacy through the influence profile. |
| 1.2.16.100 | Rare technologies, crafting recipes or discoveries | Attunement is a permanent regional discovery/rite; quest choices unlock chronicle outcomes, rare-good rewards and permanent regional bonds. |

## Rendering and performance

- The tint is a 96×64-ish atlas canvas stretched over the baked terrain surface.
  It costs one draw at world prerender, not a branch per terrain pixel.
- The landmark overlay is culled by region bounds and then by the canvas. At low
  zoom only a soft glow is drawn; landmark shapes appear when the tile is large
  enough to read.
- Feature shapes cover glowing trees, crystal shards, mushrooms, deadwood, fog,
  springs, cave mouths, floating rock, glass, beasts, runestones, moor lights,
  ashfall and mineral seams. Unknown future kinds fall back to a survey glow.
- The feature count is at most 12 regions × 9 anchors = 108, with no per-frame
  allocation of large arrays.
- The normal terrain renderer, WebGL path, cached path and canvas fallback all
  call the overlay after fog, so hidden regions stay hidden.

## Save compatibility

The block is additive and stays on **save schema 11**:

```json
{
  "specialBiomes": {
    "version": 1,
    "seed": 20261160,
    "regions": [{ "id": "special-biome-1", "family": "crystal-land", "x": 74, "y": 31, "discovered": true, "attuned": false, "spread": 0 }],
    "rareGoods": { "crystal-shard": 4 },
    "history": [],
    "lastYear": 8,
    "lastDiscoveryTick": 400,
    "totalDiscovered": 2,
    "totalYield": 9,
    "totalHazards": 1,
    "totalAttuned": 1,
    "totalTraded": 3,
    "lastHazardYear": 7
  }
}
```

Old saves without the block generate a fresh atlas for their seed after
`initWorld`, then continue normally. Loading a save with the block restores
discoveries, goods, attunement, blight pressure, counters and history, then
rebuilds the tile map and tint. Validation rejects unknown families, malformed
coordinates, out-of-range radii and negative/unknown rare goods.

## Verification

- `tests/systems/special-biomes.test.js` — 11 focused atlas tests covering the
  manifest, family vocabulary, deterministic placement, overlap-free regions,
  map lookup and bounds, discovery cadence, annual yields, attunement cost,
  blight cleansing, market sales, serialization/normalization and malformed
  snapshot rejection.
- `tests/systems/special-biome-couplings.test.js` — 8 focused coupling tests
  covering diplomacy, battlefield cover/attrition, harvest/production/growth,
  quests and rites, blight decrees and expiry, realm-cycle unrest, exact
  save/load and malformed coupling rejection.
- `npm test` — **1091/1091** plus the syntax/UI-ID audit.
- `npm run test:endurance:60` — the real campaign driver over **60 years /
  24,040 ticks**, exact full-save round-trip with the coupling block, and a
  legacy load without the block. Measured **1.076 ms/tick**, population **74**,
  all campaign requirements green.
- Browser E2E and the production build are recorded in the release changelog.
  The browser endurance gate is a resumable audit: **20 years** run on every
  push, while the full **60-year** soak runs nightly.

## Known limits

- Hollow Depths is represented as a surface region with cave-mouth anchors,
  underground-lake anchors, special flora/fauna and an attunable rare good; it is
  not a second traversable underground map layer.
- Landmarks are visual and economic anchors, not individually pathable units.
- The atlas is deliberately capped at twelve regions per world. A larger cap
  would add discovery surface, not simulation depth, and was rejected to protect
  low-end frame and tick budgets.
- Coupling quests are deliberately limited to six active and twelve archived
  entries. Their costs and consequences read the existing resource, politics and
  morale systems; they do not create a second economy.
