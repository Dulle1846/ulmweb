# Kings & Cards — Agent Mission

Develop **Kings & Cards** into a high-performance browser game that runs smoothly even on low-end devices, featuring an incredibly deep, interconnected living-world simulation. Combine grand strategy, city building, kingdom management, RPG, economy, diplomacy, warfare, and exploration into one immersive, dynamic, and highly replayable sandbox where every system influences every other. Always deploy everything. Always check from the perspective of a player and make it perfect to them. 

## Working rules

- Preserve the static browser architecture, existing systems, save compatibility and deterministic simulation.
- Keep per-frame and per-tick work bounded; put ecological change on a bounded cadence.
- Extend shared data and existing render/simulation patterns instead of building parallel systems.
- Verify in the smallest sufficient scope: run the affected test files while iterating, then one full `npm test` per batch before commit. Do not rerun an unchanged green check.
- Run the deterministic 25-year campaign for simulation or economy changes and the relevant browser reference for visual or render changes. Leave the 60-year soak to the nightly workflow or an explicit release check; do not block routine edits on it.
- Keep every gate at full strength. Save time by choosing the smallest sufficient check, batching independent commands and running independent checks in parallel — never by lowering years, FPS, render scale, save/load requirements or tolerances.
- Docs- or CI-only changes skip browser E2E and campaign runs but must still pass `npm test` and the production deploy gate.
