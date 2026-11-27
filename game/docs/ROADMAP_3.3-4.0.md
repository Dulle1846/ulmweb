# Kings & Cards — Roadmap 3.3 to 4.0

This roadmap extends the requested 3.2–4.0 version plan and the Lite City Builder brief. It distinguishes implemented foundations from planned systems. A roadmap entry is not a claim that the feature already exists.

## 3.3 — Roads and settlement infrastructure foundation

**Status: shipped to `ulmweb-branch` on 2026-11-05 (PR #27).**

- Dirt, gravel and paved roads.
- Resource costs, upgrades, demolition refund.
- Click/drag placement and explicit exit from build mode.
- Road rendering and intersections.
- Road-aware movement and A* routing.
- Road upkeep in the economy ledger.
- Versioned save/load and browser E2E.

Still not included: warehouses, physical hauling, production chains, housing tiers, service radii or full seasonal farming.

## 3.4 — Resource geography and site suitability

Goal: make terrain matter to the settlement economy.

- Seed-generated forest stands, stone deposits, water access and fertile soil.
- Resource nodes stored compactly; no thousands of heavyweight objects.
- Woodcutters require a forest within an efficient work radius.
- Quarries require a stone deposit.
- Wells and water access require valid water-bearing terrain.
- Resource stocks deplete and recover at measured rates.
- Forest regrowth and forester planting.
- Map overlays for resource quantity, suitability and depletion.
- Site placement preview explains why a building is invalid.
- Migration-safe resource node state in save files.

Acceptance: two identical seeds produce identical nodes; depletion persists after reload; extraction stops cleanly at zero; starting settlements never spawn with all essential industries invalid.

## 3.5 — Production chains, warehouses and physical hauling

Goal: goods must move through the settlement rather than teleport between buildings.

First chains:
- Forest → logs → sawmill → planks.
- Farm → grain → mill → flour → bakery → bread.
- Quarry → stone → mason → cut stone.
- Water source → well/water carrier → household and production use.

Logistics:
- Warehouses with category filters and finite capacity.
- Worker/carrier job board with source and destination reservations.
- Goods move in bounded batches; carts increase carrying capacity.
- Roads and distance influence travel time and route choice.
- Congestion, blocked paths and missing workers reduce throughput.
- Prevent deadlocks with expiring reservations and job cancellation.
- Storage UI shows stock, reserved stock, capacity and inbound/outbound jobs.

Acceptance: no double-delivery, no negative inventory, no duplicated resource creation; a broken route produces a visible warning rather than deleting goods.

## 3.6 — Housing, households and citizen needs

Housing progression:
- Tent / temporary shelter.
- Timber cottage.
- Stone house.
- Larger family dwellings and noble residences later.

Population gates:
- Free housing capacity.
- Available food reserve.
- Free jobs or sustainable unemployment.
- Immigration rate responds to safety, health, wages and reputation.

Needs:
- Food variety and supply.
- Water.
- Winter warmth / firewood.
- Safety and health.
- Social life: market, tavern, temple/church, gathering spaces.
- Work and rest.

Consequences should be gradual: warning → reduced productivity → illness/absence → unrest or migration. Avoid instant game-over for a single missed delivery.

## 3.7 — Seasons, services and settlement character

Seasons:
- Spring: sowing and repair.
- Summer: growth and construction.
- Autumn: harvest and storage.
- Winter: crop slowdown/shutdown, heating demand and travel penalties.

Visual evolution:
- Fields show fallow, seed, growing and mature states.
- Buildings show foundation, frame, finished and damaged states.
- Forest regrowth is visible over time.
- Snow, mud, harvest and seasonal lighting affect the world.

Service radii:
- Markets and stalls improve access to goods.
- Wells provide water coverage.
- Taverns and temples improve social needs.
- Watchtowers and palisades improve safety.
- Radius overlays must explain coverage and gaps.

Random events:
- Drought, blight, fire, disease, merchant visits, new deposits, festivals and local disputes.
- Events are seed-driven, context-weighted, telegraphed and recoverable.
- Choices have delayed consequences.

## 3.8 — Royal court, advisor and living nobility

**Status:** the court, the resident-led noble houses, the royal advisor and the succession-law consumer are implemented. Noble land armies and the bounded feud chain are implemented; autonomous noble conflict beyond that chain remains future work; see [NOBILITY.md](NOBILITY.md) and [NOBLE_FEUD_CHAIN.md](NOBLE_FEUD_CHAIN.md).

Royal advisor:
- A named character with skills, personality, loyalty, ambition and relationships.
- Reviews the realm at a measured cadence.
- Proposes concrete decisions based on actual shortages, treasury, threats and faction pressure.
- Can be wrong, biased or self-interested.
- Player may accept, reject, delay or request evidence.
- Advisor memory records prior advice and outcomes.
- Advice must cite the game state it is based on; no arbitrary omniscience.

Royal court:
- Ministers, stewards, marshals, spymasters, treasurers, clergy and diplomats.
- Office competence, loyalty, influence, rivalries and succession.
- Appointment and dismissal consequences.

Nobility:
- House identity, land claims, wealth, troops, legitimacy and family ties.
- Rivalries, marriages, inheritance, wardships, feuds and petitions.
- Political interests emerge without the player directly triggering every conflict.
- Factions and crown authority respond to the balance of power.

## 3.9 — Dynasty, constitution and diplomacy

- Succession laws: absolute primogeniture, male preference, council election and future custom rules.
- Regency, contested claims, abdication, usurpation and civil conflict.
- Parliament/council, courts, rights, taxes and decrees.
- Laws have supporters, opponents, costs and enforcement limits.
- Neighboring realms with rulers, dynasties, economies and military strength.
- Treaties, alliances, trade agreements, guarantees, rivalries and wars.
- Diplomacy uses durable state and long-term consequences, not one-off text choices.

## 3.10 — Full creature ecosystem and comic-art expansion

Creature ecosystem:
- Dragons, wyverns, trolls and additional species.
- Species-specific habitat, food, territory, temperament and social behavior.
- Eggs, nesting, maturity, breeding and mortality.
- Predation, scavenging, migration and competition.
- Reactions to settlements, roads, livestock, noise and conflict.
- Creature relationships, injuries, memory and territory changes.
- Ecological pressure and population caps prevent runaway spawning.

Art:
- Consistent comic-art line weight, silhouettes, palette and material language.
- Buildings, citizens, animals, creatures, cards, portraits and event illustrations.
- Construction and upgrade animations.
- Art is optimized for sprite sheets / SVG assets, with fallbacks and no unnecessary multi-gigabyte downloads.

## 4.0 — Great World and long-running history

- Multiple kingdoms and map regions. **Implemented in 3.69.0:** ten saved provinces held by five crowns (the player's crown and the four diplomatic realms), with control, loyalty, garrisons, yearly yields, contested borders, deterministic ownership changes and one charged border claim per year; see [WORLD_KINGDOMS.md](WORLD_KINGDOMS.md).
- World map, trade routes, borders and frontier settlements. **Implemented in 3.50.0:** a WORLD management tab over the real settlement seats and diplomatic realms, standing annual caravans that move goods through the existing market stock and seat depots, and saved frontiers that follow treaties and can raid; see [WORLD_MAP.md](WORLD_MAP.md). The 3.69.0 province layer extends that same map and annual task.
- Long-term world history, chronicles and generational change.
- Scenario editor and multiple start conditions. **Implemented in 3.49.0:** five authored openings, a local custom editor and a daily objective that reads the live realm; see [SCENARIOS.md](SCENARIOS.md).
- Save migration and world simulation performance for long campaigns.
- Optional mod/data packs only after schema and security boundaries are stable. **Implemented in 3.69.0:** a versioned, size-bounded JSON pack with a closed schema, forbidden-key/markup checks, semantic game-version compatibility, local storage and exactly two consumers (start-screen scenarios and province labels); no code execution or save mutation; see [DATA_PACKS.md](DATA_PACKS.md). **Extended in 3.89.0:** validated `forests` data and a scenario `forestType` binding feed the shared ten-province forest legacy ledger; new forest types must keep the guardrails in [FOREST_LEGACY.md](FOREST_LEGACY.md).
- Long-term forest systems, regional catastrophes, conservation and memory. **Implemented in 3.89.0:** ten province woods share one bounded annual pass, additive optional save state, six regional hazards, succession/climate migration/extinction and return, seed and gene banks, nursery, museum, monuments and tree rings, plus reference seeds, a 300-year soak and a mobile browser proof; see [FOREST_LEGACY.md](FOREST_LEGACY.md).

## Cross-cutting requirements for every version

- Pause and 0.5x / 1x / 2x / 4x speed remain reliable.
- Gameplay randomness is deterministic by named stream.
- Saves are versioned, validated and recoverable.
- Every new feature has unit, integration, browser and save tests.
- Every negative consequence has a warning and recovery path.
- UI controls are functional, accessible and responsive.
- Performance budgets are measured at representative population and map scale.
- New systems live in the canonical `game/` tree.
