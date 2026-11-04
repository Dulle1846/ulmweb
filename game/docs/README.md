# Kings & Cards — Technical Documentation

This directory is the working source of truth for the game's technical foundation.

## Scope

For the current development stage, these documents focus on making the existing browser game reliable, understandable, testable and extensible. Detailed game vision, player experience and feature design are deliberately out of scope for now.

## Documents

- [Technical Foundation](TECHNICAL_FOUNDATION.md) — current architecture, runtime and engineering principles.
- [Codebase Audit](CODEBASE_AUDIT.md) — verified findings from the reviewed baseline commit.
- [Foundation Backlog](FOUNDATION_BACKLOG.md) — ordered engineering work and acceptance criteria.

## How to maintain these documents

1. Update the documentation when implementation changes.
2. Separate verified current behaviour from proposed future architecture.
3. Do not mark an issue fixed until the relevant code and test have been checked.
4. Keep tasks small enough to implement and verify independently.
5. Record architectural decisions when they affect multiple modules.

## Reviewed baseline

The initial audit uses commit `dae4edd7fcb1204d794f68dc4475ac149beb5cbc` on `ulmweb-branch`. Findings describe that commit and must be rechecked against the branch being changed before implementation.
