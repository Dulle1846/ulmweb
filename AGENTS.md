# Kings & Cards — Agent Mission

Develop **Kings & Cards** into a high-performance browser game that runs smoothly even on low-end devices, featuring an incredibly deep, interconnected living-world simulation. Combine grand strategy, city building, kingdom management, RPG, economy, diplomacy, warfare, and exploration into one immersive, dynamic, and highly replayable sandbox where every system influences every other.

## Working rules

- Preserve the static browser architecture, existing systems, save compatibility and deterministic simulation.
- Keep per-frame and per-tick work bounded; put ecological change on a bounded cadence.
- Extend shared data and existing render/simulation patterns instead of building parallel systems.
- Verify with the full test suite, the deterministic 25-year campaign and the relevant browser reference when the change is visual.
