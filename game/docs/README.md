# Kings & Cards — Technical Documentation

This directory is the working source of truth for the game's technical foundation.

## Scope

For the current development stage, these documents focus on making the existing browser game reliable, understandable, testable, replaceable and extensible. Detailed game vision, player experience and feature design are deliberately out of scope for now.

## Documents

- [Technical Foundation](TECHNICAL_FOUNDATION.md) — current architecture, runtime and engineering principles.
- [Extensibility and Module Design](EXTENSIBILITY_AND_MODULE_DESIGN.md) — modularity, replaceable implementations, explicit contracts and extension rules.
- [Codebase Audit](CODEBASE_AUDIT.md) — verified findings from the reviewed baseline commit.
- [Foundation Backlog](FOUNDATION_BACKLOG.md) — ordered engineering work and acceptance criteria.
- [F0 Baseline Checklist](F0_BASELINE_CHECKLIST.md) — repeatable manual browser smoke-test procedure.

## How to maintain these documents

1. Update the documentation when implementation changes.
2. Separate verified current behaviour from proposed future architecture.
3. Do not mark an issue fixed until the relevant code and test have been checked.
4. Keep tasks small enough to implement and verify independently.
5. Record architectural decisions when they affect multiple modules.
6. Prefer small, explicit contracts over assumptions about other modules' internal state.
7. Design for new modules we cannot predict, but do not build speculative infrastructure without a concrete use case.

## Current working branch

Documentation and foundation work is being prepared on `foundation/technical-baseline`. The default development branch remains `ulmweb-branch`; it has not been changed by this documentation work.

## Reviewed baseline

The initial audit uses commit `dae4edd7fcb1204d794f68dc4475ac149beb5cbc` on `ulmweb-branch`. Findings describe that commit and must be rechecked against the branch being changed before implementation.
