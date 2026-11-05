# Simulation breadth and story engine

**Status:** Gameplay design target; implementation is incremental.  
**Working implementation branch:** `kac-2.1-stability-performance`  
**Production rule:** `ulmweb-branch` remains the production branch. Do not merge or deploy without explicit approval.

This document defines how Kings & Cards can grow from a settlement builder into a persistent, systemic kingdom simulation. It distinguishes current foundations from proposed systems. A design described here is not evidence that the feature already exists.

## 1. Design principle: simulate causes, not isolated story prompts

A story should emerge from a chain of understandable state changes.

Example: a wet spring damages roads; grain deliveries arrive late; food prices rise; poorer households reduce consumption; illness becomes more likely; workers miss shifts; mills and farms produce less; the council debates relief; the player chooses between a royal subsidy, imports, rationing or local autonomy. Later events remember the decision.

The player should be able to trace the chain back to its causes. Randomness may create uncertainty, but it must not erase causality.

The core loop is:

1. **World state changes** through time, weather, production, movement and decisions.
2. **Systems measure pressure** such as scarcity, disease risk, faction grievance or border tension.
3. **Story hooks become eligible** when their conditions are met.
4. **Issues present a legible dilemma** grounded in the current world.
5. **Cards offer interventions** that change the state or unlock a new option.
6. **Consequences persist** in people, households, institutions, markets and future story eligibility.

## 2. Simulation layers

### A. Environment and land

**Purpose:** Make geography and seasons matter after world generation.

Potential systems:
- Seasonal temperature, rainfall, storms, drought, frost and snow.
- Soil fertility, crop suitability, harvest yield and fallow cycles.
- Forest growth, timber depletion, grazing pressure and wildlife habitats.
- River levels, flooding, fishing grounds and water access.
- Roads, bridges, terrain wear and travel time.
- Local hazards such as fire, landslide, blight and contaminated wells.

Important interactions:
- Rainfall changes harvest prospects and road condition.
- Deforestation changes timber availability, wildlife and flood risk.
- Roads improve trade and response time, but require upkeep.
- Poor water access increases illness risk and limits some industries.

Start with a few aggregate regional values. Do not simulate every blade of grass or every raindrop.

### B. Production, economy and trade

**Purpose:** Turn resources into a connected economy rather than independent building counters.

Possible production chains:
- Grain → mill → flour → bakery → bread.
- Timber → sawmill → planks → construction and shipbuilding.
- Ore → smelter → metal → tools, armour and machinery.
- Wool/flax → textile workshop → cloth → clothing and trade goods.
- Livestock → meat, milk, hides and wool.
- Herbs → apothecary → medicine.
- Stone + timber + labour → roads, bridges and civic buildings.

System dimensions:
- Input stocks, output rates, storage capacity and spoilage.
- Worker skill, staffing, morale, season and building condition.
- Local demand, market access, transport cost and regional price.
- Taxes, wages, rent, debt, credit, upkeep and public works.
- Merchant inventories, route capacity, tariffs, embargoes and shortages.

Do not add a full production chain until its inputs, outputs, storage, UI, save migration and balancing tests are defined.

### C. People, households and life course

**Purpose:** Make residents persistent people rather than anonymous workforce tokens.

Recommended person record:
- Stable ID, name, age, life stage and household ID.
- Home, occupation, workplace and social status.
- A small set of bounded traits (for example diligence, sociability, courage, piety and ambition).
- Current needs and temporary conditions.
- Family and social relationship IDs.
- A compact personal history of notable events.

Household systems:
- Household size, housing quality, food access and wealth band.
- Family ties, dependants, inheritance and household head.
- Births, ageing, migration, marriage/partnership and death.
- Neighbourhood ties and shared grievances.

Needs:
- Food, shelter, safety, health, belonging and opportunity.
- Needs should influence routines and event eligibility, not force a complex decision every simulation tick.
- Use coarse household-level needs for most residents; reserve detailed individual behaviour for named or selected characters.

Relationships:
- Family, friendship, rivalry, mentorship and patronage.
- Update only a few relevant relationships per social interval.
- Candidate relationships should come from the same household, workplace, neighbourhood or event—not all possible pairs.

### D. Health, sanitation and care

**Purpose:** Make health a persistent social and economic system.

Potential progression:
1. Exposure and household transmission.
2. Recovery, treatment and temporary work absence.
3. Sanitation, clean water, crowding and seasonal disease risk.
4. Healers, infirmaries, apothecaries, quarantine and public-health policy.
5. Epidemic memory, recurring strains, immunity and long-term demographic effects.

Health consequences:
- Sick workers reduce effective staffing.
- Outbreaks affect morale and legitimacy.
- Quarantine can slow transmission but disrupt trade and work.
- Care buildings and medicine cards reduce risk or severity.
- Poor sanitation and overcrowding increase vulnerability.

Mortality should be introduced only after illness duration, treatment, household impact, demographic replacement and player communication are tested. Avoid arbitrary deaths.

### E. Politics, law and institutions

**Purpose:** Make decisions distribute benefits and burdens among groups.

Potential institutions:
- Crown, royal household, nobility, commoners, guilds, clergy, military and town councils.
- Laws, charters, taxation, privileges, courts, policing and public works.
- Offices, appointments, succession, regency and legitimacy.
- Corruption, patronage, lobbying, petitions and administrative capacity.

Each policy should have:
- A clear cost and beneficiary.
- One or more affected factions.
- An implementation delay or administrative capacity requirement where appropriate.
- A measurable effect and a future story hook.

Faction support should not be a cosmetic percentage only. Low support should change behaviour: tax refusal, strikes, petitions, defections, riots or elite obstruction—at a rate appropriate to the game's scale.

### F. Security, military and conflict

**Purpose:** Connect defence to society, geography and diplomacy.

Potential systems:
- Watch, patrol coverage, road safety and local crime.
- Garrison wages, equipment, supply and readiness.
- Bandit camps, monster lairs, raiders and border incidents.
- Muster, levy, conscription, desertion and veteran status.
- Sieges, supply lines, fortifications, treaties and war exhaustion.

A military card should create a unit or a policy obligation, not just provide a free combat bonus. Troops need food, wages, leadership and a reason to remain loyal.

### G. Diplomacy and external world

**Purpose:** Give the realm a world beyond its map edge.

Represent each neighbour or trade partner with bounded state:
- Relations, trust, rivalry, fear and obligations.
- Trade balance, supply and demand, route access and tariffs.
- Treaties, alliances, marriage ties, guarantees and hostages.
- Border claims, incidents, refugees and diplomatic missions.
- Internal stability and the partner's ability to honour agreements.

Diplomacy stories should refer to previous trade, wars, promises and decisions. A partner that was helped during famine should remember it.

### H. Culture, faith, education and knowledge

**Purpose:** Give the realm identity and long-term development.

Potential systems:
- Festivals, traditions, public rituals and local customs.
- Faith, clergy influence, pilgrimage, religious disputes and patronage.
- Schools, apprenticeships, literacy, scholars and discoveries.
- Libraries, chronicles, monuments, art, music and prestige.
- Cultural exchange through migration, trade and diplomacy.

Knowledge should unlock options and improve capabilities gradually. Avoid a disconnected technology tree with no visible social consequences.

## 3. The story engine

The story engine should be a separate domain layer, not embedded inside the random-event generator.

### Story structure

A story definition should contain:
- Stable story ID and version.
- Tags and affected systems.
- Eligibility conditions.
- Priority and cooldown.
- One or more stages.
- Choices with validated costs and effects.
- Follow-up conditions and deadlines.
- Consequence memory and completion state.

An issue instance should snapshot the facts that justified its appearance. It should not silently change its premise if the underlying state changes before the player chooses.

### Trigger types

- **Threshold:** food stores fall below a population-adjusted reserve.
- **Trend:** prices rise for several market updates.
- **Combination:** high crowding + low food + active illness.
- **Relationship:** a named rival, family member or faction leader returns.
- **Calendar:** harvest, winter, annual council, succession anniversary.
- **Location:** a road, bridge, mine, river or border is affected.
- **Player action:** a card, policy, building or previous choice creates a hook.
- **External actor:** a trade partner, neighbour or travelling group makes a move.

### Story lifecycle

1. Candidate hook created.
2. Eligibility and priority checked.
3. Cooldown, duplicate and queue limits checked.
4. Issue presented with its causal context.
5. Choice validated against current resources and capacity.
6. Effects applied atomically.
7. A compact world-memory record is stored.
8. Follow-up hooks are scheduled.
9. Story concludes or remains open with a clear status.

Keep the event queue bounded. If several issues are eligible, prioritize the most consequential and avoid showing repetitive families back-to-back.

### Consequence memory

Store facts, not a full transcript of every tick. Examples:
- A household received royal relief in year 4.
- The guild charter was denied.
- The northern partner was embargoed.
- A named resident led a successful rescue.
- The crown broke a treaty.
- The last epidemic was contained by quarantine.

These facts can alter later story text, options, relationships and faction pressure.

## 4. Cards as interventions in the simulation

Cards should become the player's compact action language. They should not all be buildings.

Recommended card roles:
- **Construction:** buildings, roads, bridges, walls and public works.
- **People:** settlers, specialists, envoys, leaders and named characters.
- **Policy:** tax reform, charter, rationing, quarantine, patrols and privileges.
- **Production:** workshops, tools, seeds, livestock and supply improvements.
- **Diplomacy:** treaties, trade missions, gifts, marriages and guarantees.
- **Knowledge:** surveys, schools, research, maps and discoveries.
- **Crisis response:** medicine, relief, repairs, fire brigades and emergency stores.
- **Story objects:** evidence, relics, letters, claims, heirlooms and contracts.

Every card definition should eventually specify:
- Stable ID, role, tags and rarity.
- Preconditions and target scope.
- Resource cost and any recurring obligation.
- Effects and affected systems.
- Whether it is consumed, placed, retained or scheduled.
- Failure reasons and preview text.
- Save/load representation and regression tests.

Cards and issues should be linked both ways:
- Issues can award or unlock cards.
- Cards can create issue hooks.
- A card can resolve a condition before an issue appears.
- A card can change which choices are available.
- Previous card use can be remembered by later stories.

## 5. Example systemic story arcs

These are design examples, not claims about existing implemented content.

### The hungry winter
Poor harvest → falling food reserves → rising prices → household hardship → illness and unrest → council relief debate → long-term trust or resentment.

Card hooks: grain stores, mill, bakery, trade caravan, ration decree, public granary.

### The guild's charter
A new workshop prospers → guild membership grows → the guild requests exclusive rights → independent craftsmen object → royal decision changes prices, employment and faction support.

Card hooks: guildhall, royal charter, market inspector, master artisan, open-market decree.

### The river's course
Heavy rain → flood damage → bridge closure → trade disruption → displaced households → debate over rebuilding, relocation or tolls.

Card hooks: bridge, levee, surveyor, ferry, public works levy.

### The fever in the lower ward
Crowded housing + poor water → first illness → household spread → worker absence → healer petition → quarantine dispute → later memorial or reform.

Card hooks: infirmary, apothecary, clean well, quarantine order, healer.

### The disputed succession
A ruler weakens or dies → rival claims emerge → nobles choose sides → clergy debates legitimacy → military loyalty is tested → settlement through marriage, council, force or abdication.

Card hooks: royal marriage, succession charter, regent, oath, royal guard.

### The border road
Bandit attacks rise → caravans reroute → market stock falls → border villages petition → patrol funding or treaty negotiation → partner relations change.

Card hooks: watchtower, road wardens, envoy, patrol decree, fortified bridge.

### The scholar's discovery
A survey or relic is found → scholars and clergy dispute its meaning → research costs resources → a new technology or public controversy emerges → future options change.

Card hooks: academy, library, expedition, archive, relic.

## 6. Simulation cadence and performance

The current game uses a 400-day year and a 20-tick economy interval. New systems should respect explicit update frequencies rather than run all logic every frame.

Recommended cadence:
- **Every simulation tick:** movement, immediate combat and urgent timers.
- **Every 5–10 ticks:** local needs, short status timers and selected hazard checks.
- **Every 20 ticks:** economy, health transmission, market and household pressure.
- **Every 100 ticks / seasonal boundary:** harvest, climate, seasonal demand and local festivals.
- **Every 400 ticks / year:** ageing, demographic changes, annual accounts and political milestones.
- **On demand:** story eligibility, card effects, save snapshots and UI queries.

Performance rules:
- Never perform all-pairs resident relationship checks each tick.
- Use household, workplace, neighbourhood and region groupings.
- Keep event memories, active stories, histories and pending effects bounded.
- Aggregate ordinary residents; give detailed simulation only to a limited set of named characters.
- Cache derived data and invalidate it on structural changes.
- Keep rendering, simulation and UI refresh schedules independent.
- Profile before adding workers, Web Workers or more complex spatial indexes.

## 7. Data integrity and save compatibility

Before deepening a system:
- Define its authoritative state and stable IDs.
- Define safe defaults for old saves.
- Clamp and validate imported values.
- Ensure effects are atomic: validate all costs and capacity before applying any part.
- Store only domain data; never serialize DOM, Canvas, caches or transient rendering objects.
- Test save → load → save equivalence for that system.
- Test malformed and partial legacy data.
- Keep migration functions deterministic and idempotent.

## 8. Recommended implementation order

### Phase 1 — Foundation for deep simulation
1. Stable person and household IDs.
2. Seeded random streams separated for world, simulation, cards and stories.
3. Explicit simulation scheduler and bounded state validation.
4. Versioned save schema and migration tests.

### Phase 2 — People become a society
1. Household needs and quality of life.
2. Life stages, ageing and family links.
3. Occupation skills and work satisfaction.
4. Relationships among a bounded set of relevant residents.
5. Named characters and persistent biographies.

### Phase 3 — Interdependent material world
1. Soil and harvest variation.
2. Food storage, spoilage and local demand.
3. Flour/bread production chain.
4. Roads and transport capacity.
5. Trade route disruptions and regional price propagation.

### Phase 4 — Institutions and conflict
1. Faction grievances tied to concrete outcomes.
2. Laws, taxes and charters.
3. Crime, policing and courts.
4. Diplomacy, treaties and partner memory.
5. Military supply, readiness and desertion.

### Phase 5 — Story and card integration
1. Condition-based issue hooks.
2. Story queue, priorities and cooldowns.
3. Consequence memory and recurring named characters.
4. Policy, crisis-response and diplomacy cards.
5. Multi-stage stories with branch-specific endings.

Health is an early cross-system slice and can be expanded alongside Phases 2–4. Do not implement every phase in one change. Each vertical slice must include code, tests, save migration, UI and a documented acceptance test.

## 9. Current implementation boundary

The existing game already has foundations for a card hand, generated issue families, eleven authored story chains, households, workforce, housing, a resource economy, market partners, political factions, local saves and bounded presentation effects. These foundations should be extended rather than replaced.

The first public-health slice now adds household-level transmission, illness timers, recovery, temporary workforce loss, treatment/containment choices and persistent health statistics. It does not yet simulate mortality, water sanitation, named physicians, immunity or a full medicine production chain.

The card catalogue's combinatorial variant space is generated on demand. It must not be described as individually authored cards. Likewise, generated narrative combinations are not equivalent to individually authored quests.


## 10. Phase 2.2 implementation: deterministic identity foundation

The next implementation slice introduces reproducible named random streams and stable entity identity before deeper biographies and relationship graphs are added.

Implemented on `kac-2.2-seeded-simulation`:
- `game/js/core/random.js` derives independent deterministic streams from the realm seed and a per-stream counter.
- Streams are separated for entity initialization, cards, issues, health, weather, villagers, combat and population changes. Legacy utility callers use the general simulation stream.
- Stream counters are included in local save snapshots and restored before the next simulation decisions. Older saves without counters safely start with empty counters.
- Spawned entities receive stable seed-scoped IDs. Villagers and the player-overridable king also receive a `personId`.
- IDs are serialized; legacy saves receive deterministic IDs during restore.
- Unit tests cover replay, stream isolation, save/restore of counters, malformed counter input and identity allocation.

This is a foundation, not a full deterministic replay guarantee yet: any remaining direct nondeterministic source or unconverted random call must be migrated before promising bit-for-bit replay of every possible simulation path. The person record still needs names, species, traits, life stages, family, memories and relationships in later slices.


## 11. Phase 2.2 person-profile foundation

The initial persistent person record now exists for every spawned villager and for the king. It contains:
- Stable person ID and generated first/family name.
- Data-driven species key, including human, elf, dwarf, orc, goblin, halfling, gnome, dragonkin, fae and revenant.
- Age in years and a derived young/adult/elder life-stage label based on the species profile.
- Ten bounded personality dimensions (ambition, courage, compassion, greed, sociability, discipline, curiosity, piety, distrust and patience).
- Five bounded needs (food, rest, safety, belonging and purpose), one initial goal, and bounded memory/relationship/secret collections.
- Creation year and tick, so later chronicle entries can be placed on the realm timeline.

Profiles are serialized with entities and normalized on load. Memory insertion is exposed through `addPersonMemory`; the next slice must connect important world events and royal decisions to the people who actually experienced them. The current profile is deliberately not yet a full autonomous character: it does not yet contain family trees, active plans, social network simulation, aging transitions, species-specific culture, or UI inspection.


## 12. Phase 2.3 — event-linked personal memory and relationships

The first person/story integration slice connects consequential realm issues to a small, explicit cast of people. This is intentionally not an all-resident social simulation.

Implemented on `kac-2.3-living-chronicles`:
- Every generated issue stores up to three stable person references: one affected resident, an optional witness for civic/political issues, and the king as decision-maker when present.
- Participants are selected from existing living person records using the dedicated `people` random stream. The same person IDs are retained through multi-stage chronicle threads and archived with completed threads.
- Resolving a valid choice writes a compact first-person memory to each participant. Affected residents, witnesses and the king receive different memory framing.
- Memory IDs are event/person scoped, so retrying the same event outcome does not duplicate the memory or relationship update.
- Affected residents gain a directed relationship record toward the king; the king also receives a weaker reciprocal record toward the resident. Trust/respect/affinity are bounded and updated only when the selected outcome has a measurable public impact.
- Relationship collections are capped at 32 per person; event memories remain capped at 24. No all-pairs scan or per-frame relationship update is introduced.
- Legacy active events without participant snapshots receive a bounded participant selection at resolution. Older chronicle threads without participants get a participant snapshot when their next stage is presented.

This is a deliberately narrow first model. Participants are selected from the realm's existing resident profiles, not from a spatially accurate incident radius: event families do not yet carry reliable map coordinates or named locations. The relationship score is a compact response to the choice's public/political/health effects, not a full psychological model. There is no relationship decay, family/kinship graph, social network propagation or character inspection UI yet.

Acceptance tests cover participant selection, durable and idempotent memories, bounded directed ruler relationships and event-to-person integration. The next slice should add event location/household provenance and a character chronicle UI before expanding relationship simulation.


## Implemented follow-up — explicit family graph (Phase 2.5)

The person model now includes bounded, persistent kinship collections:
- `parents`: up to two explicit parent links, each typed biological, adoptive or guardian.
- `children`: reciprocal child links with the same relationship kind.
- `partners`: reciprocal partner/marriage history, including ended relationships.

The family module rejects self-parentage, missing entities, invalid parent kinds, parent-limit violations and ancestry cycles when creating links. Siblings are derived from shared explicit parent IDs. Save loading normalizes legacy records and repairs reciprocal references after entity restoration.

This is not yet a birth or succession simulator. Birth generation, death, name transmission, inheritance, title succession, family UI and autonomous family decisions remain separate work. No relationship is inferred from co-residence.


## Implemented follow-up — character inspection UI (Phase 2.6)

A read-only character dossier now exposes the existing persistent person model in-game. The roster is searchable by name, species, role and family name. A selected dossier shows identity and life stage, personality, needs, goals, memories ordered by tick, social relationships and explicit family links (parents, children, siblings and partnerships).

This UI makes current data inspectable; it does not create relationships or simulate births, deaths, inheritance or succession. Historical kinship links whose counterpart is no longer loaded remain visible as a stable-ID reference. The UI escapes saved text before rendering it.


## Implemented follow-up — species-aware family births (Phase 2.7)

Births are now a persistent simulation event, not an arbitrary population increment. The annual scheduler considers explicit reciprocal partner/marriage records only; it never infers parentage from shared housing. Eligible parents must be living adult villagers of the same fantasy species. The scheduler uses an isolated deterministic random stream and applies a 12% annual chance per eligible partnership, with a three-year partnership cooldown.

A birth is gated by household vacancy, food reserves, morale and entity limits. The newborn is a real age-zero villager assigned to a parent household where possible. The child's species and family name are inherited from the parents under the current same-species-only rule. Parent-child links are recorded explicitly in both directions, and both parents plus the child receive bounded personal memories. The realm event log records the birth.

Cross-species hybridization, autonomous partner formation, royal births, natural mortality and dynastic succession are deliberately not guessed at in this phase. They need separate rules and tests.
