# Kings & Cards — Long-Term Playability Audit

**Audit baseline:** production branch `ulmweb-branch`  
**Baseline commit:** `bffeb1afb82da9c51c622a0a6a0ed8006560c74b`  
**Baseline version:** `3.4.0`  
**Audit branch:** `kac-3.5-long-run-audit-and-ledger`  
**Date:** 2026-11-05

## 1. Purpose and acceptance standard

The objective is not merely to keep the browser tab open. A long campaign must remain technically stable, economically understandable, strategically interesting and recoverable after save/load.

A release is not certified as multi-hour playable until:
- the full simulation advances through representative multi-year horizons;
- deterministic runs with the same seed and inputs produce the same authoritative state;
- no resource, money, population, entity, event or archive counter grows without a defined bound;
- production consumes the correct inputs and cannot create goods from nothing;
- the player receives understandable warnings and recovery options before collapse;
- save/load preserves all authoritative state and older supported saves migrate safely;
- browser E2E covers the actual player loop, not just isolated modules;
- performance stays within documented budgets on a representative browser session.

## 2. Verified production baseline

### Runtime and calendar
- Fixed-step simulation is orchestrated by `game/js/simulation/simulation.js`.
- A simulation day advances one tick.
- A year contains 400 days; four seasons are 100 days each.
- Base tick interval is 750 ms at 1x; 0.5x, 1x, 2x and 4x are exposed in the UI.
- The current victory milestone is evaluated at year 12 when morale is above 80. The simulation function does not stop solely because `victory` becomes true.
- Game over is triggered when morale falls below 8 after tick 800.
- The current long-simulation test runs 1,200 ticks (3 in-game years) with 180 villagers and checks finite coordinates/entity bounds plus a generous 10-second CI guard. A separate movement benchmark tests 120 villagers and 12 enemies over 180 movement steps.

### Economy
- Economy settlement runs every 20 simulation days.
- Household food demand is 0.015 food per resident per day.
- Wages, taxes, building upkeep and road upkeep are accounted for in the recurring ledger.
- Farms, lumber buildings, quarries, gold mines, mills, taverns and temples have workforce-based efficiency.
- Mills consume wood to improve nearby farm output; taverns consume food before generating gold.
- Existing tests cover several input/output and no-free-production cases.

### Population and society
- Housing capacity is four residents per house in the current population module.
- Annual population growth is gated by free housing, morale and food reserves.
- The simulation calls yearly people, mortality, guardianship, succession, creature, social, agency and birth updates.
- Health is updated from the central simulation loop.
- Persistent identities, family and character systems exist in the repository tree, but every feature branch/PR is not necessarily merged into production. Verify the exact production implementation before relying on a branch-only feature.

### Resource geography — current limitation
Version 3.4.0 adds deterministic per-tile forest/stone stocks, fertility and water access, bounded extraction helpers, forest regrowth and sparse save deltas.

The 3.4.0 PR explicitly states that resource overlays and production buildings drawing from finite resource nodes are not included yet. The current building production implementation still grants lumber and quarry output through workforce efficiency without calling the resource-geography extraction helpers. Therefore the finite map-resource model is **not yet the limiting input for those production buildings**. This is a known gameplay integration gap, not a completed production chain.

### Save system
- Browser-local profiles and saves are used; no server account system is required.
- The save envelope currently uses a versioned localStorage key and preserves a best-effort previous valid backup.
- Resource-geography depletion is stored as sparse deltas and validated.
- A full long-run audit must still verify all new authoritative systems, archive limits, corrupted-save recovery, quota exhaustion and repeated load/save cycles.

## 3. Existing automated coverage — what it proves and what it does not

| Existing test area | What it currently checks | Limitation |
|---|---|---|
| Long simulation | 1,200 ticks, 180 villagers, finite coordinates, entity cap and runtime guard | 3 years only; not a multi-hour/25-year campaign |
| Movement benchmark | 120 villagers + 12 enemies over 180 movement steps | Does not prove economy or multi-year stability |
| Production chains | Mill/tavern input consumption and no free output | Small isolated test cases |
| Production determinism | Same-seed lumber output reproducibility | One production slice, not whole-world replay |
| Resource geography | Seed determinism, extraction, regrowth and sparse save data | Production buildings are not yet connected to the nodes |
| Browser E2E | Core play interactions, roads and resource save/load paths | Not a multi-hour browser soak test |

Passing these tests is useful evidence, but it is not yet certification of a several-hour campaign.

## 4. 3.5.0-dev test programme

### A. Multi-year simulation horizons
Required deterministic headless horizons:
- 1 year / 400 ticks — smoke and boundary conditions.
- 5 years / 2,000 ticks — early economy and population.
- 10 years / 4,000 ticks — first victory milestone and mid-campaign stability.
- 25 years / 10,000 ticks — first multi-hour-equivalent campaign horizon at 1x.
- 50 years / 20,000 ticks — long-run drift.
- 100 years / 40,000 ticks — extended stress run.
- 250 and 500 years only as opt-in/nightly stress jobs after runtime profiling.

The 25-year target corresponds to 10,000 simulation days. At the current 750 ms base tick interval this is 125 minutes at 1x, before pauses and UI time. A 100-year campaign is a stress target, not a claim that a normal player must wait 8 hours in real time.

### B. Invariants on every horizon
- All authoritative numeric state remains finite.
- All resource balances remain non-negative.
- Morale remains in its documented range.
- Entity positions remain finite and within world bounds.
- Entity count stays below the explicit world cap.
- IDs remain unique and monotonic.
- Housing and household references do not point to destroyed or missing houses without a defined recovery path.
- Family/guardian/relationship references resolve to a live person or an explicit archive record.
- Event queues, memories, chronicles, logs, presentation effects and archives have documented caps/retention rules.
- No production chain creates output without consuming its input.
- No extraction consumes more than the available node stock.
- Same seed + same actions produce identical authoritative snapshots.

### C. Economy scenarios
Test at least:
1. Healthy starting settlement with staffed farms and sufficient housing.
2. Unstaffed farms and food shortage.
3. Exhausted forest/stone nodes.
4. Treasury insolvency with wages/upkeep arrears.
5. Road upkeep added and removed.
6. Illness temporarily reducing workforce.
7. Seasonal production changes.
8. Recovery after the player adds workers, food production or reduces upkeep.
9. Save/load at a mid-crisis point, then continue and compare with uninterrupted simulation.
10. Several world seeds and World Forge configurations, including low-forest and low-water starts.

### D. Save/load and deterministic replay
- Save at years 1, 5, 10 and 25.
- Load each save and compare canonical state snapshots.
- Run 100 save/load cycles with no resource, ID or relationship drift.
- Test legacy saves without resource geography.
- Test malformed sparse deltas, duplicate indices, out-of-range coordinates and negative quantities.
- Test storage quota failure without destroying the last valid save.
- Compare uninterrupted and save/load-interrupted runs for the same seed and player actions.

### E. Browser soak and interaction
- Keep the browser session open while advancing 1x, 2x and 4x.
- Pause/resume repeatedly.
- Open/close management, trade, statistics, event log and character views.
- Build, upgrade and demolish roads.
- Save/load while simulation is paused and running.
- Confirm no uncaught exceptions, unbounded DOM growth, input lock or stuck build mode.
- Record memory and CPU at 10, 30 and 60 minutes on a defined reference device/browser.

## 5. Priority implementation backlog

### P0 — Connect finite resource geography to actual production
- Lumber buildings must reserve/harvest forest stock from valid nearby nodes.
- Quarries must reserve/extract stone from valid nearby deposits.
- No valid node means no extraction; UI explains why.
- Extraction must respect worker efficiency, capacity, distance and stock.
- Resource depletion must persist through save/load.
- Forest regrowth must be slow and bounded; stone must not regenerate unless a specific rule is designed.
- Starting seeds must be validated so essential industries have reachable starter deposits or an explicit alternative.

### P0 — Long-run test harness
- Add a 25-year headless integration test using a controlled, deterministic settlement.
- Add shorter 1/5/10-year checkpoints and invariants.
- Add a separate opt-in 100-year stress test if the regular suite becomes too slow.
- Report ticks/s, entities, population, resources, memory proxies and simulation outcome.
- Never hide a failing scenario by relaxing assertions without explaining the design change.

### P1 — Economy balance and recoverability
- Add explicit warning thresholds for food, treasury, wages and upkeep.
- Ensure crisis effects are staged: warning → reduced efficiency/absence → unrest/migration → collapse.
- Provide recovery levers and enough grace time for player action.
- Avoid arbitrary positive feedback loops and unlimited passive resource generation.
- Review taxes, wages, building upkeep, road upkeep and card rewards as one ledger.

### P1 — Long-running world history
- Bound event logs, personal memories, chronicles, relationship edges and archived records.
- Preserve important royal, family and settlement history with summaries rather than unlimited raw event copies.
- Use stable IDs and explicit archive references.
- Define deletion/retention semantics for dead, migrated and removed entities.

### P2 — Player goals after the first milestone
- Clarify whether year-12 victory is a campaign ending, a chapter milestone or a sandbox achievement.
- If sandbox continuation is intended, introduce new goals and escalating but recoverable challenges.
- Add milestones for population, infrastructure, trade, dynasty, diplomacy, ecology and world exploration.
- Ensure goals reward different strategies rather than one optimal farm/market loop.

## 6. Release gates

Do not merge a 3.5.0 release until:
- full unit suite passes on exact PR head;
- browser E2E passes on exact PR head;
- 25-year integration test passes with invariants;
- 100-year stress run passes or documented, bounded limits are accepted;
- save/load and legacy migration tests pass;
- performance benchmark has baseline and regression threshold;
- resource extraction is connected to lumber/quarry production;
- a manual playtest confirms the player can understand and recover from shortages;
- Cloudflare Pages confirms the deployed commit and the public Pages URL serves it.

## 7. External review and AI delegation

External AI systems are reviewers, not trusted maintainers. No external agent should receive secrets or permission to merge/deploy. Give each reviewer only the relevant source files and this audit, request findings with file/line references and test cases, then reproduce every claim locally/through CI.

Suggested review roles:
- **Architecture reviewer:** inspect state ownership, import cycles, save schemas and migration.
- **Simulation/economy reviewer:** inspect conservation of resources, production/consumption, growth and failure loops.
- **QA reviewer:** design edge cases and long-run invariant tests.
- **Performance reviewer:** profile hot loops, entity growth and memory retention.
- **Game-design reviewer:** assess 30-minute, 1-hour and 3-hour player goals and recovery pacing.

External reviews do not replace automated tests or human release acceptance.
