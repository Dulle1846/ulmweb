# Noble arbitration and settlement (3.85.0)

The noble houses keep their existing living-host and feud layer. Version 3.83 adds a bounded escalation chain to the same
`state.nobility.feuds[]` entries, so old saves keep every existing feud and gain the stages on their next annual
maintenance.

## Chain

| Stage | Player action | Consequence |
| --- | --- | --- |
| `grievance` | `noble-feud-arbitrate` (gold cost) | Moves the dispute into `arbitration`, reduces severity and adds a counsel case. |
| `arbitration` | `noble-feud-settle` with `compensation` or `charter` | Closes the feud for good, spends treasury gold or grants a bounded charter, and records the resolution. |
| `grievance` / `arbitration` | `noble-feud-inflame` | Keeps the old player freedom: declares a blood feud with a 1.25 severity multiplier. |
| `blood-feud` | `noble-feud-mediate` | Keeps the old arbitration-to-peace path. |

Existing `mediate`, `inflame` and `ignore` buttons remain available. The new buttons are rendered only where the
stage allows them. No parallel feud engine, new top-level DTO, new tab or save-schema bump was introduced.

## Living consequences

- `nobleFeudPenalty()` is the shared severity source for house loyalty, tax and levy penalties. Arbitration reduces
  the incoming penalty to 0.85; a blood feud multiplies it to 1.25.
- An arbitration or settlement case appears in counsel for the current year, so the player is told what the written
  terms will cost or grant.
- The first-session continuation allowlist accepts `noble-feud-arbitrate` and `noble-feud-settle` alongside the
  existing feud commands.
- Annual `nobleFeuds` maintenance ages open cases, applies bounded relapse only to quiet arbitration and logs stage
  changes. It is part of the same bounded annual task list as the rest of the simulation.

## Atlas quest follow-ups

A completed biome quest can arm exactly one bounded follow-up inside
`state.specialBiomes.couplings.questFollowUps`. Follow-ups use their own IDs, stage, choice, deadline and note; they
do **not** reuse site `claim`, `chainStage`, `SITE_CHAINS` or `notes`. They are shown as real cards with buttons in
**Explore**, can be answered once, and lapse once at their annual deadline. Costs and rewards are costed through the
existing resource ledger and are deterministic. Counsel and first-session continuation expose the active case.

The implementation never calls `Math.random`, never adds an RNG stream and never touches the protected forest IDs
`1.2.23.1.031`–`1.2.23.1.060`.

## Verification

The focused suites cover the stage validity, penalty multipliers, settlement ledgers, save round-trip, expiry,
Explore rendering, counsel wiring and dispatch contracts:

- `tests/systems/noble-feuds.test.js`
- `tests/systems/nobility.test.js`
- `tests/systems/special-biome-couplings.test.js`
- `tests/presentation/core-counsel.test.js`
- `tests/presentation/first-session.test.js`

Real-browser proofs click the visible arbitration and settlement buttons in `nobility-ui.mjs` and the visible quest
and follow-up buttons in `biome-atlas-ui.mjs`, then verify the saved state after reload. The full 25-year campaign
and the complete test suite stay at their existing budgets.
