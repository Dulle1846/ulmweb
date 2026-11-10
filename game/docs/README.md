# Kings & Cards — Technical Documentation

This directory is the working source of truth for the game's technical foundation.

## Scope

For the current development stage, these documents focus on making the existing browser game reliable, understandable, testable, replaceable and extensible. Detailed game vision, player experience and feature design are deliberately out of scope for now.

## Documents

- [Master UI implementation register](MASTER_UI_IMPLEMENTATION.md) — status against the approved visual design concept, implemented navigation contract and remaining acceptance work.

- [Technical Foundation](TECHNICAL_FOUNDATION.md) — current architecture, runtime and engineering principles.
- [Extensibility and Module Design](EXTENSIBILITY_AND_MODULE_DESIGN.md) — modularity, replaceable implementations, explicit contracts and extension rules.
- [Codebase Audit](CODEBASE_AUDIT.md) — verified findings from the reviewed baseline commit.
- [Foundation Backlog](FOUNDATION_BACKLOG.md) — ordered engineering work and acceptance criteria.
- [F0 Baseline Checklist](F0_BASELINE_CHECKLIST.md) — repeatable manual browser smoke-test procedure.
- [Baseline Fix Review](BASELINE_FIX_REVIEW.md) — source repairs, known gaps and verification still required.
- [Source Structure](../game-structure) — current directory tree and module responsibilities.
- [Zoom and Building Placement](ZOOM_AND_BUILDING_PLACEMENT.md) — four detail levels, camera behaviour and drag-and-drop validation.
- [Terrain Visual Reference](TERRAIN_VISUAL_REFERENCE.md) — committed four-season, four-zoom contact sheet and reproduction script.
- [Laubwälder 1.2.1](FOREST_ECOLOGY.md) — shared forest ecology, all eight broadleaf species, fifteen formations, the 60-point audit and the forest visual references.
- [Nadelwälder 1.2.2](CONIFER_FORESTS.md) — five conifer species, twelve conifer formations, seasonal larch needles, needle-floor ecology, conifer products and disturbance succession.
- [Named garrison and public health](MILITARY_AND_PUBLIC_HEALTH.md) — barracks/stables, named recruits and timed drill, warhorses and annual payroll, sanitation, outbreaks, healers, medicine, quarantine, mortality and the schema-5 save contract.
- [Faith, culture and justice](FAITH_AND_JUSTICE.md) — named clergy and judges, shrines, courts and prisons, festivals, pilgrimages, heresy, emergent crime, trials, legal codes, charters, corruption, schema-6 saves and the verified hosted build.
- [Realm founding](REALM_FOUNDING.md) — cultures, religions, traditions, legal orders, legitimacy doctrines, starting charters, oligarchy and mixed constitution, save-compatible identity modifiers and the verified hosted build.
- [Living population](LIVING_POPULATION.md) — persistent citizens and households, the deterministic annual census, civic/economic/military modifiers, save-schema-7 migration, the PEOPLE panel and the verified hosted builds.
- [Eternal deeds](ETERNAL_DEEDS.md) — repeatable post-ambition goals drawn from live systems, rewards, stall protection, save compatibility and the 50-year/browser evidence.
- [Crown supply](CROWN_SUPPLY.md) — grain contracts including the war granary, seasonal deliveries, commissary barter, paid waterworks, stone-house density, farm subsistence and garrison pay in kind, with the v3.13.1 journey measurements.
- [Terrain Art Checklist](TERRAIN_ART_CHECKLIST.md) — item-by-item audit of checklist 1.1.1–1.1.10 with code and verification evidence.
- [Kings & Cards Foundation](V2_FOUNDATION.md) — current playable systems, exact limits and verified checks.
- [Next AI Work Package](NEXT_AI_WORK_PACKAGE.md) — ready-to-use handoff brief for contributors and AI sessions.
- [Simulation Design and Story Engine](SIMULATION_DESIGN_AND_STORY_ENGINE.md) — systemic gameplay vision, interdependencies, cards, issue chains, cadence and phased implementation plan.

## How to maintain these documents

1. Update the documentation when implementation changes.
2. Separate verified current behaviour from proposed future architecture.
3. Do not mark an issue fixed until the relevant code and test have been checked.
4. Keep tasks small enough to implement and verify independently.
5. Record architectural decisions when they affect multiple modules.
6. Prefer small, explicit contracts over assumptions about other modules' internal state.
7. Design for new modules we cannot predict, but do not build speculative infrastructure without a concrete use case.

## Aktueller Entwicklungsstand

`ulmweb-branch` ist der gemeinsame Entwicklungsstand. Technische Dokumentation und Quellcode liegen gemeinsam unter `game/`; es gibt keine separate Parallelstruktur für die Grundlagenarbeit. Der tatsächliche Modulbaum steht in [`../game-structure`](../game-structure).

## Reviewed baseline

The initial audit uses commit `dae4edd7fcb1204d794f68dc4475ac149beb5cbc` on `ulmweb-branch`. Findings describe that commit and must be rechecked against the branch being changed before implementation.
