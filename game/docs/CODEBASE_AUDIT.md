# Codebase Audit — Initial Baseline

**Reviewed commit:** `dae4edd7fcb1204d794f68dc4475ac149beb5cbc`  
**Review type:** Static source inspection; the game was not executed in a browser.

These findings refer to the reviewed commit. Recheck the current branch before acting on them.

## Confirmed high-priority issues

### 1. Card placement references an undefined world grid

**Files:** `js/systems/cards.js`, `js/state.js`, `js/world/world.js`

Card placement reads `state.world[tx][ty]` in both the nearest-buildable-tile search and the requested-tile validation. The reviewed `state.js` does not define `state.world`, and `initWorld()` creates height/moisture maps and an exploration array instead of a tile-object grid.

As written, card placement can fail while attempting to access `state.world`.

**Engineering direction:** Use the existing terrain queries (such as `isWaterAt()`) and entity occupancy queries, or deliberately design and initialize a separate occupancy/spatial data structure. Do not silently assume a tile grid exists.

### 2. Game speed is applied twice to simulation time

**Files:** `js/main.js`, `js/simulation/simulation.js`

The main-loop accumulator multiplies elapsed frame time by `state.gameSpeed`, increasing the number of simulation updates. Each update then increments `state.tick` by `state.gameSpeed` again.

This means logical tick count advances faster than the intended speed, while `dayOfYear` increments only once per update. Tick-based systems and calendar time can therefore diverge.

**Engineering direction:** Each call to the logical simulation update should advance one tick. Speed should be represented by the accumulator's update frequency. Define and test the tick-to-calendar conversion separately.

## Other verified foundation gaps

### 3. Randomness is not reproducible

**Files:** `js/world/world.js`, `js/types.js`, `js/utils.js` and multiple systems.

Terrain initialization chooses a random seed internally, does not store it in `state`, and other systems use `Math.random()` directly. A complete game cannot currently be recreated from a saved world seed.

### 4. Persistence is not implemented

The reviewed game state contains live Canvas/DOM references and runtime objects, and there is no save/load module or versioned save schema in the game tree. A deliberate serialization boundary is needed before the state grows substantially.

### 5. Technology descriptions exceed implemented effects

**Files:** `js/systems/tech.js`, `js/simulation/buildings.js`

Technologies can be marked as unlocked and some unlock messages are displayed. However, the advertised gameplay modifiers are not consistently consumed by the simulation. For example, the building income implementation does not check the irrigation unlock before applying the advertised farm-production bonus.

### 6. Raid-survival statistic increments on raid creation

**File:** `js/main.js`

`state.totalRaidsSurvived` is incremented immediately after the first raid is spawned. This records a raid as survived before it has been resolved.

### 7. Keep destruction has no matching defeat presentation

**File:** `js/simulation/combat.js`

When the Keep reaches zero health, combat sets `state.gameOver = true`. Unlike the morale defeat path in `simulation.js`, this branch does not call the defeat message UI.

## Structural observations

- The current modules are separated into world, systems, simulation, rendering and orchestration areas.
- Some gameplay modules import presentation modules. For example, card/technology/event code imports UI or particle rendering functions. This creates avoidable coupling.
- The game uses a global mutable state object. This is workable at prototype scale but needs documented mutation ownership as systems grow.
- Entity identity is currently based on object instances and array membership; no stable persistent entity ID is present in the reviewed `Entity` class.
- No automated test suite or build/test configuration is visible in the reviewed repository tree.

## Audit limits

This is not a runtime QA report. It does not establish browser compatibility, actual frame rate, gameplay balance or whether every path is reachable. Each issue should be reproduced with a focused test before a code fix is merged.
