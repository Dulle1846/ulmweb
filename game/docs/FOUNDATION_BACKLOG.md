# Foundation Backlog

**Status:** Initial engineering backlog  
**Scope:** Stabilize and prepare the technical framework. Detailed gameplay/experience design is intentionally deferred.

Priority meanings:
- **P0:** Blocks reliable operation of existing core functionality.
- **P1:** Required before the simulation grows significantly.
- **P2:** Scale, maintainability or tooling improvements after the core contracts are stable.

## Work sequence

### F0 — Establish a safe baseline

- [x] Confirm the default development branch and reviewed baseline commit: `ulmweb-branch` at `dae4edd7fcb1204d794f68dc4475ac149beb5cbc`.
- [x] Initialen Browser-Baseline-Test ausgeführt und den reproduzierbaren Kartenplatzierungsfehler inklusive Konsolen-Stacktrace festgehalten. Die übrigen manuellen Tests sind noch offen.
- [x] Create a reproducible smoke-test checklist in [F0_BASELINE_CHECKLIST.md](F0_BASELINE_CHECKLIST.md). Test results remain unrecorded until execution.
- [x] Baseline-Beobachtung und anschließende Reparatur nachvollziehbar dokumentiert.

**Current status:** F0 is teilweise abgeschlossen. Der Browserstart und der konkrete Kartenplatzierungsfehler wurden dokumentiert. Die vollständige Checkliste und der erneute Browserlauf nach den Reparaturen stehen noch aus.

**Browser evidence (2026-11-04):** The Chrome-Screenshot zeigte ein geladenes Spiel, aber einen `state.world`-TypeError beim Kartenplatzieren. Der Codepfad wurde repariert und in `ulmweb-branch` übernommen. F0 bleibt offen, bis die vollständigen Smoke-Tests und der erneute Browserlauf gegen den reparierten Stand erfolgt sind.

**Repair review:** See [Baseline Fix Review](BASELINE_FIX_REVIEW.md). Die Codekorrekturen sind übernommen; als Laufzeitfehler behoben gelten sie erst nach erfolgreichem Browser-Nachtest.

**Exit condition:** The team can reliably start the game and distinguish existing failures from regressions.

### F1 — Stabilize critical runtime behaviour (P0)

- [x] Resolve the `state.world` mismatch in card placement (Browser-Nachtest noch ausstehend).
- [x] Use the terrain query as authoritative buildability source.
- [x] Add full-footprint occupancy, terrain and world-boundary checks.
- [x] Correct the double application of game speed.
- [x] Define one logical tick per update and a 400-day year; timing tests remain open.
- [ ] Add regression tests for card placement and simulation speed.

**Exit condition:** Card placement works on valid terrain, rejects invalid/occupied locations, and simulation speed behaves consistently at 1x, 2x and 4x.

**F1 implementation status:** The core source corrections are in place. Browser verification and automated regression tests remain required before closing F1.

### F2 — Establish test and debugging foundations (P1)

- [ ] Choose a minimal test runner compatible with the current JavaScript module setup.
- [ ] Add unit tests for pure calculations and individual system rules.
- [ ] Add deterministic integration tests for core update sequences.
- [ ] Add a browser smoke test for module loading and game initialization.
- [ ] Make runtime errors easy to capture and reproduce.

**Exit condition:** Core logic can be tested without manually playing through the game.

### F3 — Formalize state and entity contracts (P1)

- [ ] Document the authoritative state schema.
- [ ] Define stable unique IDs for entities.
- [ ] Define how systems create, update, remove and reference entities.
- [ ] Separate persistent domain data from Canvas, DOM and disposable caches.
- [ ] Define validation rules for state invariants.

**Exit condition:** State and entity identity are explicit, testable and suitable for serialization.

### F4 — Introduce deterministic randomness (P1)

- [ ] Store the world seed in authoritative state.
- [ ] Introduce a seeded RNG interface.
- [ ] Replace direct gameplay calls to `Math.random()` with injected RNG access.
- [ ] Decide whether world-generation and simulation randomness use separate streams.
- [ ] Test that the same seed and inputs reproduce the same generated baseline.

**Exit condition:** A bug report can include a seed and reproduce the relevant generated state.

### F5 — Design and implement persistence (P1)

- [ ] Define a versioned save-data schema.
- [ ] Add serialization and deserialization modules.
- [ ] Exclude DOM, Canvas and visual caches from saved data.
- [ ] Restore entity references by stable ID.
- [ ] Add validation and migration handling.
- [ ] Test save-load-save equivalence for authoritative state.

**Exit condition:** A game can be saved, loaded and continued without losing or corrupting authoritative simulation data.

### F6 — Enforce module boundaries (P1)

- [ ] Document allowed import directions.
- [ ] Move shared domain contracts into lower-level modules where necessary.
- [ ] Remove simulation-to-rendering and systems-to-UI dependencies.
- [ ] Break circular dependencies.
- [ ] Keep `main.js` as composition/orchestration rather than a gameplay system.

**Exit condition:** Domain/simulation modules can run in tests without a browser DOM or Canvas.

### F7 — Prepare for scale (P2)

- [ ] Add instrumentation for tick duration, frame duration and entity counts.
- [ ] Measure expensive world, entity and simulation queries.
- [ ] Add spatial indexing only where profiling identifies a bottleneck.
- [ ] Define update-frequency policies for authoritative simulation and visual-only effects.
- [ ] Evaluate Web Workers only after module boundaries and data-transfer contracts are stable.

**Exit condition:** Performance changes are driven by measurements and preserve deterministic simulation behaviour.

## Working rules

1. Work on one backlog item or tightly related group at a time.
2. Create a separate issue or pull request for non-trivial changes.
3. Keep fixes small and add regression coverage.
4. Do not redesign unrelated systems while fixing a foundation issue.
5. Update this backlog and the technical foundation document when implementation changes.
6. Do not label a task complete until its exit condition has been checked.
7. Modules communicate through explicit contracts; they do not reach into one another's private state.
8. Treat this as a modular monolith first. Do not add speculative plugin frameworks, microservices or universal abstractions without a proven need.
