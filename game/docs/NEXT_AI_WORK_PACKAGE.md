# Next AI work package — Kings & Cards

This is a handoff brief for another contributor or AI session. It is written to be usable without the full conversation history. It describes the current development work, not permission to merge or deploy.

## Repository and safety rules

- Repository: `Dulle1846/ulmweb`
- Production branch: `ulmweb-branch`
- Current production release: 3.3 road construction, PR #27 merged at `fe248e694b50477136f3cdb3a182466788fe1c32`.
- Next implementation target: Phase 3.4 deterministic resource geography. Create a new feature branch from current `ulmweb-branch` and a PR; do not edit production directly.
- PR #27's exact tested head `5dba0ab974826fab3fd515639bc66ffa800928ba` passed Game Quality, Game Browser E2E and Kings & Cards 2.1 checks.
- Game root: `game/`
- Player-facing game text: English. Conversation and explanations to the user: German.
- Production merges and deployment are authorized by the project owner only after the documented release gates; do not bypass those gates.
- Cloudflare Pages is the intended production host. Do not use Vercel builds, previews or deployments.
- Vercel is not the production host. The current GitHub App installation/removal state has not been re-verified; do not attempt to bypass GitHub's sudo-mode confirmation. Cloudflare Pages and the legacy workers.dev Worker are separate targets.
- Keep saves browser-local. Do not invent a cloud account or cloud-save layer.
- World generation remains procedural and controlled by the seed and world-forge settings. Do not replace the player's existing card hand with world-generation cards.
- Make small, coherent commits. Run `cd game && npm test`, inspect GitHub Actions and browser-test affected interactions.
- Distinguish hand-authored content from generated combinations. Variant counts are not counts of individually authored cards or quests.

## Current implemented foundations on the development branch

- Parchment / illuminated-manuscript UI, four zoom bands, procedural terrain, exploration and world-forge controls.
- Hand-based cards: empty starting hand, on-demand random draw from the Cards panel, hand limit five, placement preview and validated placement.
- Card catalogue: 50 thematic groups × 10 categories = 500 categories; 10 scales × 10 rarities × 10 contexts = 500,000 possible on-demand variants. These are not 500,000 hand-authored cards.
- Event generator: 30 families × 10 places × 10 scene openings × 10 details × 5 text variants = 150,000 generated combinations. These are not individually authored quests.
- Eleven hand-authored three-stage chronicle arcs: migration, crime, ruins, diplomacy, plague, rebellion, guild, succession, shortage, flood and fire.
- Event choices can change resources, morale, long-term realm pressures, politics and future card rewards. Chronicles persist in local saves.
- Four-resource economy, workforce capacities, household food demand, taxes, wages, upkeep, unpaid obligations and production-chain accounting.
- Regional trade partners, inventory scarcity and price pressure.
- Housing capacity, households of up to four residents, annual population growth and annual ageing.
- Political state with legitimacy and commoners, nobility, guilds and clergy.
- Public-health slice: household-level illness transmission, recovery timers, temporary workforce loss, treatment/containment choices, morale effects and saved health state. Mortality, sanitation infrastructure, immunity and a full medicine economy are not implemented yet.
- A* fallback pathfinding with route caching, rendering and presentation-effect caps, entity caps and performance safeguards.
- Browser-local profiles and saves with migration/default handling.

## Earlier implementation slice: public health (historical baseline)

The first public-health implementation lives in `game/js/systems/health.js`.

It is connected to:
- `simulation/simulation.js` for periodic updates.
- `systems/events.js` for illness/plague issue decisions.
- `systems/economy.js` so sick residents do not count as available workers.
- `app/main.js` for save/restore of illness and public-health state.
- `presentation/rendering/ui.js` for population health statistics.
- `systems/population.js` and `systems/cards.js` for household assignment consistency.

Tests are in `game/tests/health.test.js`. Check the latest GitHub Actions runs for the exact current branch head before assuming the work is verified.

Important limitations:
- Disease spread is household-scoped and interval-based, not a medical epidemiology model.
- Recovery is timer-based; there is no mortality yet.
- Care buildings currently use the existing temple building type as a coarse protective proxy.
- The illness model does not yet include sanitation, clean water, immunity, named physicians or medicine production.
- Health and event systems still use the existing global state conventions; avoid adding circular imports.

## Core next project: deepen the simulation

Read `game/docs/SIMULATION_DESIGN_AND_STORY_ENGINE.md` first. It defines the intended breadth, causal links, story lifecycle, card roles, performance cadence and implementation phases.

Recommended next slices:
1. Stable person IDs and versioned save migration.
2. Seeded random streams for world, simulation, cards and events.
3. Household needs and quality-of-life indicators.
4. Family links, life stages and a limited set of persistent named characters.
5. Relationship/faction interactions with bounded update cadence.
6. Soil, harvest variability, food storage and spoilage.
7. A small complete production chain (grain → flour → bread).
8. Condition-based issue hooks and a bounded story queue.
9. Roads, transport capacity and trade-route disruptions.
10. Sanitation, infirmaries, treatment and health-policy cards.

Do not attempt to implement all of these in one commit. Each vertical slice needs tests, save compatibility, UI feedback, performance checks and explicit acceptance criteria.

## Architecture and performance rules

- Keep the game a modular monolith; do not introduce services or a third-party plugin runtime prematurely.
- Domain/simulation modules must not import presentation modules or manipulate DOM/Canvas.
- Avoid circular imports. The composition root is the place to wire modules.
- Use stable IDs, validated DTOs and bounded state. Do not use array positions as long-lived identities.
- Do not perform all-pairs relationship checks every tick. Group by household, workplace, neighbourhood or region.
- Use explicit simulation intervals; avoid expensive scans every animation frame.
- Keep event logs, memories, active chronicles, pending effects and queues bounded.
- Profile before introducing Web Workers, spatial indexes or additional caching.
- Treat CI benchmark values as runner-specific measurements, not device FPS guarantees.

## Agent handoff protocol

If another AI or human contributor is used:
1. Give them this file and `SIMULATION_DESIGN_AND_STORY_ENGINE.md`.
2. Ask them to work only on a named feature slice and a separate branch or patch.
3. Require a file list, design assumptions, tests, known limitations and exact commit/patch.
4. Do not let an external agent merge, deploy or modify the production branch.
5. Review and run all changes on the current development branch before integration.

## Deliverable standard

Before editing, inspect the live branch and relevant files. Implement the smallest coherent slice, add unit and integration tests, run the full test suite, inspect the CI logs, and browser-test relevant interactions. Report exactly what is implemented, what is approximated, what remains open, and the exact tested commit. Never claim work or tests that have not happened.


## Phase 2.2 — deterministic identity foundation

Current incremental branch: `kac-2.2-seeded-simulation`; draft PR #7 targets the 2.1 development branch, not production.

Implemented in this slice:
- Named deterministic RNG streams and saved stream counters.
- Stable seed-scoped entity IDs and resident/king person IDs.
- Legacy save migration for missing IDs and random-stream counters.
- Tests for RNG replay, stream isolation, save restoration and entity identity.

The current CI must be checked on the exact latest PR head before treating the slice as verified. Do not merge or deploy. Cloudflare Pages remains production; do not use Vercel.


## Current implementation status (2026-11-05)

Branch: `kac-2.2-seeded-simulation`; draft PR #7 against `kac-2.1-stability-performance`.

Implemented and CI-verified on the previous code head:
- Named deterministic RNG streams with local save/restore.
- Stable entity IDs and person IDs.
- Persistent person profiles for villagers and the king: name, fantasy species, life stage, traits, needs, goal, memories and relationship collection.
- Legacy-save normalization for missing person data and RNG counters.
- Tests for RNG replay/isolation, ID allocation, person profile normalization and bounded memories.

Next tasks for an independent agent:
1. Connect `addPersonMemory` to consequential events with participant/observer relevance, avoiding a memory for every trivial tick.
2. Implement relationships with stable target person IDs, relationship type, strength, trust, history and bounded updates.
3. Implement households/families, kinship, birth/death and succession as data-driven systems; never infer family solely from same-household membership.
4. Add a character inspection panel with biography, needs, traits, memories and relationships; preserve the comic-medieval UI direction.
5. Add deterministic tests for save/load, multi-year aging, memory relevance, relationship decay and bounded storage.
6. Profile population scaling before increasing resident counts; maintain the hybrid detail model and explicit entity/memory caps.

Do not claim autonomous character behavior until goals are evaluated against world state and actors can select/execute actions. Do not merge or deploy this draft. Cloudflare Pages is the production host; do not use Vercel.

## Phase 2.3 — event-linked personal chronicle slice

Branch: `kac-2.3-living-chronicles`, based on merged development head `ff80b644e4c9c3bb207de41866bbf977ecccb347`. Production branch `ulmweb-branch` is not the target.

Implemented:
- Generated events select a bounded cast of affected resident(s), witness(es) and the king decision-maker using stable person IDs.
- Resolved event choices add distinct, event-scoped personal memories to participants.
- Residents' directed relationship toward the king changes modestly according to the public impact of the chosen response; a weaker reciprocal record is stored on the king.
- Multi-stage story threads carry the same participant IDs forward and completed threads retain their cast.
- Memory/relationship lists remain bounded and normalized on load; duplicate outcome replay is idempotent for memories and relationship changes.

New/expanded tests:
- People receive durable event memories and directed relationships.
- Participant selection uses existing stable person IDs and remains bounded.
- Resolving a generated issue writes memories to the named cast.

Limitations:
- No full autonomous decision-making, family graph, relationship decay, local incident-radius simulation, long-term memory summarization or character UI.
- This slice uses up to three actors per issue and bounded personal memory (24) / relationship (32) lists. It is not a simulation of every citizen's complete biography.
- UI browser coverage is still required if/when a character-inspection panel is introduced.

Agent follow-up:
1. Build a read-only character dossier panel from `getPersonSnapshot`, including biography, memories and relationships.
2. Add household/family identity as explicit stable data; do not infer kinship from shared housing.
3. Add life-year aging and species-specific maturation/lifespan with deterministic tests.
4. Add named-location provenance to events, then choose affected residents by household/workplace/region rather than a global resident pool.
5. Implement a bounded goal evaluator and autonomous action selection as a separate slice; the king remains autonomous by default but player-overridable.
6. Preserve the comic-medieval/tower-defence visual direction; do not re-theme the current UI in this backend slice.

Do not merge or deploy without review of exact-head CI and user authorization. Cloudflare Pages remains the production target; never configure Vercel.


## Phase 2.4 — species-aware annual aging

Branch: `kac-2.4-life-cycles`; stacked on the event-linked chronicle slice. The pull request is targeted at `kac-2.1-stability-performance` so the normal PR CI filters apply; it currently includes the 2.3 dependency until PR #8 is merged.

Implemented:
- Person profiles now store `lastAgedYear`, an explicit cursor preventing duplicate aging.
- The simulation advances age only when the 400-day realm calendar rolls into a new year.
- Species-specific maturation thresholds update young/adult/elder life stages.
- Crossing a life-stage boundary adds one bounded personal memory with a stable ID.
- Legacy profiles without an aging cursor begin aging at their restored current year; they do not receive an accidental catch-up of unknown elapsed years.
- Multi-year catch-up is capped at 1,000 years and memory remains bounded.

Not implemented: mortality, births, kinship, inheritance, succession, family-name transmission or autonomous life plans. These require the next explicit family/lineage and succession model. Do not derive parenthood from a shared household.


## Phase 2.5 — explicit family and kinship graph

Branch: `kac-2.5-family-kinship`, based on the species-aware life-cycle branch.

Implemented in this slice:
- Person records persist bounded `kinship` collections for parents, children and partners.
- Parent/child edges are explicit, typed (biological, adoptive or guardian), reciprocal and idempotent.
- Self-parentage, unknown people, invalid link types, more than two parents and ancestry cycles are rejected.
- Partnerships are reciprocal, typed by status (partner, married, separated or divorced), and retain ended relationships as history.
- Siblings are derived only from shared explicit parent IDs; co-residence does not imply kinship.
- Legacy person records migrate to empty bounded kinship collections.
- Save loading repairs reciprocal links after all entities and stable person IDs have been restored.

Not implemented in this slice:
- Birth/death generation, automatic parent assignment, family-name inheritance, inheritance, succession, family tree UI or autonomous family decisions.
- The graph is a data foundation; it does not infer parenthood or marriage from household membership, age, appearance or proximity.

Verification required on the exact branch head:
- Full Node test and syntax suite.
- CI browser E2E and save/load checks.
- Review of malformed legacy graph handling and long-running storage bounds.

Do not merge or deploy without user approval. Cloudflare Pages remains production; do not configure or use Vercel.


## Verification update — family graph, 2026-11-05

The current 2.5 family-kinship slice is implemented on `kac-2.5-family-kinship` and tracked by Draft PR #10.

Exact code/test head before this documentation refresh: `4961800814defb6160a73e09b8e088e7cd82056b`.

Verified GitHub Actions for that exact head:
- Game Quality: [run 41998125897](https://github.com/Dulle1846/ulmweb/actions/runs/41998125897) — **141/141 Node tests passed**, 0 failed; syntax and relative imports for 42 source files, 77 referenced UI IDs and local HTML assets passed.
- Kings & Cards 2.1 checks: [run 41998125860](https://github.com/Dulle1846/ulmweb/actions/runs/41998125860) — successful.
- Game Browser E2E: [run 41998125548](https://github.com/Dulle1846/ulmweb/actions/runs/41998125548) — successful; Chromium smoke coverage includes world forge, seed, card hand, real drag placement, settings, pause/resume and save/load, with no page errors.

These checks verify the inherited game flows and the family graph unit tests. The browser E2E does not yet exercise a dedicated family-tree UI because that UI is not part of this slice. The documentation refresh was also checked on the final PR head below.

Do not merge or deploy without explicit user approval.


## Final PR verification — 2026-11-05

Final documented head: `e0e2295ae71f990183103b43b1f9e048ebd4a020`.

All three GitHub Actions workflows completed successfully for this exact head:
- [Game Quality — run 41998323162](https://github.com/Dulle1846/ulmweb/actions/runs/41998323162): **141/141 tests passed**, 0 failed; syntax/import checks passed for 42 source files, 77 UI references and local HTML assets.
- [Kings & Cards 2.1 checks — run 41998323175](https://github.com/Dulle1846/ulmweb/actions/runs/41998323175): successful.
- [Game Browser E2E — run 41998323446](https://github.com/Dulle1846/ulmweb/actions/runs/41998323446): successful; Chromium smoke test confirmed world forge, seed, hand, real card drag placement, settings, pause/resume and save/load without page errors.

The E2E test covers the existing game flow, not a family-tree UI. The family graph itself is covered by the Node test suite. No merge or deployment was performed.


## Final family-graph hardening verification — 2026-11-05

Final implementation head before this note: `26afd6708d3f35b5f371f3842382355328c5c625`.

- [Game Quality — run 41998590793](https://github.com/Dulle1846/ulmweb/actions/runs/41998590793): **142/142 tests passed**, 0 failed; syntax and relative imports for 42 source files, 77 UI references and local HTML assets passed.
- [Kings & Cards 2.1 checks — run 41998590486](https://github.com/Dulle1846/ulmweb/actions/runs/41998590486): successful.
- [Game Browser E2E — run 41998590522](https://github.com/Dulle1846/ulmweb/actions/runs/41998590522): successful Chromium gameplay smoke test; real card drag placement, settings, pause/resume and save/load passed without page errors.

The final hardening adds explicit rejection when a parent would exceed 64 child links or a person would exceed 16 partner links. Rejected additions do not create one-sided reciprocal records. The new regression test is included in the 142 passing tests.

No production branch changes, merge or deployment.


## Phase 2.6 — searchable character dossiers

Branch: `kac-2.6-character-dossiers`, Draft PR #11.

Implemented:
- Read-only roster of named residents and the king, sorted by ruler-first/name order.
- Search by name, species, role and family name; the UI caps visible results at 100.
- Dossiers show identity, age/life stage, personality, needs, goals, personal memories, relationships and explicit kinship.
- Personal memories are shown in reverse chronological order with year and tick.
- Historical references to people no longer present remain readable by stable person ID.
- Saved person names, roles, relationship labels and memory text are escaped before HTML insertion.
- Browser E2E covers opening the dossier, selecting a person, checking personality/chronicle sections, searching, clearing the search and closing the dialog.

Verified at code head `1ec969d5e9b875ae0a25963cf883ff98ecb9556e`:
- Game Quality: **142/142 tests passed**, 0 failed; syntax/import/UI/asset checks passed.
- Kings & Cards 2.1 checks: successful.
- Chromium Browser E2E: successful, including the new dossier interaction and the existing gameplay/save-load smoke coverage.

Limitations:
- Dossiers are read-only; they do not create/edit kinship.
- No birth, death, inheritance, succession, secret discovery or autonomous family decision system yet.
- The E2E smoke test verifies dossier UI behavior but does not simulate a populated multi-generation dynasty; family graph invariants remain covered by Node tests.

No production merge or deployment.


## Phase 2.7 — species-aware births from explicit partnerships

Implemented on `kac-2.6-character-dossiers` (stacked into Draft PR #11).

- A yearly birth scheduler considers only explicit, reciprocal partnerships whose status is `partner` or `married`; co-residence alone never creates parentage or eligibility.
- Both parents must be living villagers of the same species, have reached that species' adult maturation age, and be no older than 65% of its configured lifespan.
- The autonomous scheduler uses a deterministic, isolated `births` random stream and a 12% annual chance per eligible partnership. At most one child is born per realm year.
- A three-year cooldown is stored on both reciprocal partnership records.
- Birth requires a real household vacancy, sufficient food reserve and morale, plus available entity capacity. A newborn is assigned to an available parent household where possible.
- The child is a real persistent villager with age zero, species, inherited family name, born-year/tick metadata, two explicit biological parent links and a bounded birth memory.
- Both parents receive an individual family memory; the child receives an origin memory. A birth event is added to the realm log.
- Save migration initializes birth counters and the annual scheduler cursor safely for older saves.

### Scope and limitations
- Cross-species reproduction is intentionally disabled until explicit hybrid inheritance rules are designed; no species is silently converted into another.
- This phase does not yet create partnerships autonomously. The scheduler activates only when a valid partnership already exists in the kinship graph.
- The king and non-villager entities are excluded from this first birth pass; royal succession and royal offspring require a separate dynastic model.
- Births are not guaranteed every year: the scheduler is chance-based and constrained by household capacity, food, morale and entity limits.
- Natural mortality, orphan care, inheritance, succession, and autonomous family formation remain future phases.

### Verification target
New Node tests cover explicit parentage, surname inheritance, reciprocal kinship, memory records, partnership status, species/adulthood eligibility, resource/housing gates, cooldown and once-per-year scheduling. The PR's CI run on the final head is the authoritative pass/fail signal; no result is claimed before it completes.


## Phase 2.8 — autonomous social ties and partnership formation

Implemented on `kac-2.6-character-dossiers`, stacked into Draft PR #11.

- Residents encounter people who share a household or workplace. This is an interaction context only; co-residence/work never creates kinship.
- Encounters update reciprocal trust, respect, affinity and interaction counts using bounded personality-derived deltas and a dedicated deterministic `social` random stream.
- Relationships can develop into acquaintances, friends or rivals. Major transitions create bounded personal memories.
- Adult residents can autonomously form a partnership after repeated mutual positive encounters. Both sides must meet the affinity/trust/interaction thresholds; the default model allows one active partner per person.
- Close kin (parent/child and siblings with a shared explicit parent) are excluded from autonomous partnership formation.
- The scheduler runs once per realm year, processes at most 120 unique pairs and forms at most four partnerships per year.
- The social-year cursor is saved in the existing economy DTO and safely defaults to the restored year for legacy saves.
- Character dossiers expose the person's current reproductive sex category; legacy profiles receive a stable ID-derived category rather than a new random value on every load.

### Reproductive rules and boundaries
- Fantasy species now declare a data-driven reproduction mode: paired reproduction for the current living species; revenants are currently non-reproductive.
- Biological birth requires two same-species adult villagers with opposite reproductive sex categories and an existing reciprocal partnership that began before the current year.
- Same-sex and cross-species partnerships can exist socially, but do not produce biological children under the current rules.
- The current `sex` field is a minimal reproductive category, not a full gender-identity or species-specific reproductive biology model. Future work must separate identity, anatomy and species reproduction rules rather than assuming these are universally equivalent.
- Relationship decay, non-monogamous government/cultural rules, hybrid species, adoption-driven child creation, royal partnerships and autonomous courtship outside shared home/work groups remain future work.

### Verification target
- Tests cover once-per-year scheduling, reciprocal social values, relationship memories, autonomous partnership formation, close-kin exclusion, bounded pair work, deterministic legacy sex migration and reproduction eligibility.
- Run all three GitHub Actions workflows on the exact final head before marking the milestone verified.


## Phase 2.9 — yearly personal needs, goals and goal-driven behavior

Implemented on `kac-2.6-character-dossiers`, stacked into Draft PR #11.

- Every named living person (including non-villager person entities such as the king) receives a once-per-year needs update.
- Need values are satisfaction scores from 0 to 100, not raw need accumulation.
- Food satisfaction reacts to food reserves per resident; rest reacts to work/rest phases; safety reacts to nearby enemies and realm morale; belonging reacts to recent relationships and explicit kinship; purpose reacts to employment/office.
- A low satisfaction value selects an urgent active goal: secure food, seek rest, seek safety, build bonds or find purpose.
- When no urgent need is below the threshold, the person's existing long-term aspiration becomes the active goal.
- Goal transitions are stored in a bounded 12-entry history and create bounded personal memories.
- The active goal influences actual behavior: food-seeking residents prefer farm work where it is reasonably reachable; low-rest residents rest longer; low-safety residents keep closer to home during breaks; residents with low belonging are prioritized for social encounters.
- Per-person and realm-wide year cursors are saved and migrated for older saves.
- Social candidate generation and interaction processing remain capped at 120 pairs per year.

### Limits
This is a first needs-and-goals controller, not yet a full planner. It does not yet create personal travel plans, political schemes, education, careers or multi-step projects. Purpose, food, rest, safety and belonging now affect measurable values and a few concrete behaviors; the remaining action vocabulary will grow as economy, government and world systems are connected.

### Verification target
Node tests cover need changes, goal selection, once-per-year behavior, bounded goal history/memories, king/non-villager profiles and goal-driven farm assignment. Static checks and Browser E2E must pass on the exact final PR head.


## Phase 3.0 — natural mortality and persistent memorial archive

Implemented on `kac-2.6-character-dossiers`, stacked into Draft PR #11.

- Yearly species-aware mortality for ordinary villagers, beginning after 72% of configured species lifespan.
- Risk increases with age, low health and active illness; decisions use an isolated deterministic `mortality` random stream.
- Maximum eight natural deaths are processed per realm year to prevent sudden population collapse.
- The king and non-villager entities are explicitly excluded until royal succession and office-transfer rules exist.
- A compact, persistent memorial archive stores the deceased person's normalized profile, identity, species, age, life history, family links, death year/tick and cause.
- Surviving relatives and partners receive personal bereavement memories; the deceased receives a final death memory.
- The archive is capped at 500 compact memorials. Each record retains family links but stores at most 12 memories, 16 relationships, six secrets and eight goal-history entries. Oldest memorials are pruned when the cap is exceeded.
- Character dossiers include deceased people and preserve readable family links after their entities leave the live world.
- Save snapshots persist the archive; old saves migrate to an empty archive.
- Browser E2E creates a memorial, inspects the deceased dossier, saves/loads and verifies the memorial remains available.

### Limits
- No royal death, succession, regency, inheritance, estate distribution, orphan guardianship or funeral/religious rites yet.
- Mortality is currently a species/age/health probability model, not a full disease, injury and care system.
- The 500-entry archive is a deliberate memory bound; a later chronicle compaction/indexing design should preserve long-run realm history beyond this limit.


## Phase 2.10 — deterministic villager routines

- Removed global `Math.random()` from the villager job-refresh, routine-duration and wandering-target decisions.
- These choices now consume the dedicated seeded `villagers` random stream.
- Regression tests verify identical routine choices for identical world seeds and divergent results for different seeds.
- This closes the nondeterminism found in the inspected villager routine module; it is not a claim that every `Math.random()` in the entire game repository has been eliminated.


## Phase 2.7 — demographic correctness hardening

Branch: `kac-2.7-demography-hardening`, Draft PR #12.

Code review found two correctness defects in the existing birth/kinship flow:
- A partnership with no previous birth stored `lastBirthYear = 0`; the cooldown logic treated that sentinel as a real birth and blocked a valid first child in young realms. The cooldown now applies only when a positive birth year exists.
- Family normalization rebuilt partnership records without preserving `lastBirthYear`, and reciprocal repair did not reconcile it. Save/load could therefore erase the cooldown. Normalization now preserves the maximum recorded year on both reciprocal partner links; re-establishing a partnership preserves the previous value.

The browser memorial test also incorrectly assumed that a randomly generated fresh realm always contained a living villager. The test now constructs an isolated deterministic villager fixture before testing memorial creation. The dossier sex assertion is case-insensitive, matching the UI's uppercase presentation without changing product behavior.

Verification at code head `2d40cbf982e232a8039d0d2e4bfb8659c89d94aa`:
- **175/175 Node tests passed**, 0 failures.
- Syntax and relative-import checks passed for 47 source files.
- 84 referenced UI IDs and local HTML assets passed.
- Kings & Cards 2.1 checks passed.
- Chromium gameplay Browser E2E passed, including the memorial fixture.

No merge, production branch update or deployment was performed. The PR remains a draft.


## Phase 2.8 — explicit orphan guardianship

Branch: kac-2.8-orphan-guardianship, Draft PR #13. Verified at code head bfa06c39b09e1a84c7497a3910d1a2149fec9cd8: 190/190 Node tests passed; syntax/import/UI/asset checks, Kings & Cards 2.1 checks and Chromium Browser E2E all passed.

Implemented:
- Separate reciprocal guardian/ward links; guardianship is not misrepresented as biological or adoptive parentage.
- Bounded records: at most two guardians per ward and 16 wards per guardian.
- Species-specific maturity checks for guardian and ward eligibility.
- Annual orphan review runs after mortality. An orphan is recognized only when it has at least one explicit parent link and every recorded parent is confirmed in the memorial archive. An unresolved parent ID is not treated as proof of death.
- Candidate selection prioritizes aunts/uncles over grandparents; a non-relative is eligible only with recorded trust and affinity of at least 60. Relationship evidence may be recorded by either side; the strongest qualifying historical tie is used rather than allowing a weak newer tie to mask it. An unrelated person with no strong recorded relationship is never selected.
- A receiving household must have capacity unless the ward already lives in that household.
- Successful assignment moves the ward's household/home anchor, records reciprocal links, and writes bounded memories for guardian and ward. A guardian's death is recorded in the ward's loss memories; a replacement can be appointed in a later year while historical guardian links remain inspectable.
- Four assignments maximum per realm year; 500-entry memorial cap and existing per-person memory limits remain in force.
- Character dossiers expose guardians and wards separately from parents, children and partners. Browser E2E verifies both directions and the memorial archive/save-load flow.

Safety/limits:
- No automatic adoption, estate inheritance, royal regency or succession.
- No guardian is invented when parent death is unresolved, no trusted/related adult is available, or no receiving household has room.
- Guardianship is a social-care link, not a change of legal parentage.


## Phase 3.1/3.2 — strategy management, royal dynasty and living dragons

The strategy/dynasty/creature management foundation is now part of the merged 3.2 production baseline (PRs #24/#26). Its known preservation gaps remain tracked in `BRANCH_CONSOLIDATION_AUDIT.md`.

Implemented:
- Strategy command deck and responsive comic-style management modal: Government, Politics, Decisions, Cards, Economy, Dynasty, Creatures and Chronicles.
- Original SVG emblems for crown, scales, royal seal, cards, treasury, book, people and dragon; thick-outline parchment/blue/gold visual theme.
- Government models (feudal monarchy, royal centralism, crowned council, elective crown) with treasury costs and faction/legitimacy consequences.
- Five player decrees with resource costs, one-policy-per-year guard, morale and faction consequences.
- Government tax rate integrated into the actual economic ledger (10% baseline preserves previous calculation; 0–35% bounded range).
- Royal consort selection with adult, single-partner and close-kin exclusions.
- Royal child creation as a persistent royal unit with two explicit biological parent links, personal memories, treasury costs and four-year cooldown.
- Designated heir and succession transfer to a living adult child; late sovereign family graph provides the fallback.
- Natural mortality includes royal family members. The sovereign is only exposed to natural mortality when an adult royal child exists; minor-heir regency remains deliberately unimplemented.
- New friendly Dragon entity type; Dragon Egg card in the wyvern category; sanctuary summoning; age, life stages, health, hunger, bond, temperament, abilities, goals, milestone memories, starvation and age mortality.
- Creature memorial archive capped at 100 entries; per-dragon memory capped at 16; royal history capped at 48.
- Save/load includes royal state, royal entity flags, dragon profiles and creature memorials.

Regression coverage added in `game/tests/systems/strategy-management.test.js`:
- government normalization and treasury costs
- faction effects and annual decree guard
- royal marriage, explicit parent links and heir designation
- succession requiring a living adult heir
- close-kin and active-partner rejection
- dragon needs, growth, death memorial and entity cap
- tax-rate impact on actual assessed tax
- Dragon Egg card prototype.

Browser E2E now exercises the command deck, constitution change, public decree, consort selection, royal child creation, dragon sanctuary and card-management panel.

Limits:
- This is the first playable strategy layer, not a full grand-strategy government simulator. Ministries, offices, judiciary, parliament, election cycles, provincial autonomy, law enforcement and regency still need dedicated systems.
- Dragons are the first persistent magical creature species; other monsters and spirits still need their own species-specific behavior.
- Royal inheritance is not yet an estate/property distribution system.
- New art is lightweight SVG/vector art. Do not add gigabytes of raw assets; grow visual content through compressed sprite atlases, vector emblems, procedural variations and data-driven story packs.
- Historical note: Phase 3.2 and Phase 3.3 have been merged into production. For future work, Cloudflare Pages remains the production host; Vercel is not part of this project.

## Shipped Phase 3.3 — playable road network (PR #27)

Branch: `kac-3.3-lite-city-builder-roads`; merged into production at `fe248e694b50477136f3cdb3a182466788fe1c32`.

Implemented in the current candidate:
- Dirt, gravel and paved road tiers with incremental resource costs, upgrades and partial refunds.
- Placement validation for bounds, unexplored tiles, deep water and building footprints.
- Mouse/touch click-and-drag road painting and a visible cancel control (Escape).
- World rendering for road corridors, junctions and intersections.
- Road-quality movement modifiers and A* route costs; route caches invalidate when the road revision changes.
- Versioned road save data, validation and restoration with rollback protection.
- Unit tests for costs, upgrades, removal, bounds, water, building collision, serialization and A* preference.
- Browser E2E for road-menu selection, map click, drag painting, Escape cancellation and save/load round-trip.

The first Browser E2E run exposed a double-escaped numeric-coordinate regex in save validation. It was corrected, and the exact final tested head `5dba0ab974826fab3fd515639bc66ffa800928ba` passed all three workflows:
- Game Quality
- Kings & Cards 2.1 checks
- Game Browser E2E

The public Pages page was then fetched with a cache-busting query. The live header contained BUILD and EXIT BUILD; the build modal and deployed app bootstrap included the road/build modules. This confirms the public site serves the new road UI. The Cloudflare dashboard deployment ID and build settings still need a signed-in dashboard check.

Scope deliberately not yet implemented: warehouses, physical hauling jobs, production chains, crop seasons, housing tiers, household needs, service radii and immigration gates. Follow the delivery gates in `LITE_CITY_BUILDER_SPEC.md`.

## Next Phase 3.4 — deterministic resource geography

Start a new branch from the latest `ulmweb-branch`. First inspect `game/js/world/world.js`, `game/js/core/state.js`, the existing terrain renderer, building placement and save/load. Design compact deterministic forest, stone, water and fertile-soil node state before editing. Avoid one JS object per tile. Preserve starting-settlement viability across seeds. Add save migration, depletion/regrowth, placement previews, unit tests, integration tests, browser E2E and a 160×160 performance test. Do not start warehouses or production-chain transport until resource geography is stable.

## External AI review protocol for the next phase

Use one external coding agent at a time. Give it the current branch and this handoff document. Ask for a read-only review first; do not allow it to merge, deploy, rewrite the save schema or replace core modules wholesale. Any proposed change must arrive as a separate PR or patch with exact tests and a list of files changed.
