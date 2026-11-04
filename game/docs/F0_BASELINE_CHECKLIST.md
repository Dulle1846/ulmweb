# F0 — Baseline Smoke-Test Checklist

**Purpose:** Record current behaviour before changing the prototype. This checklist is a manual browser procedure until automated browser tests are introduced.

**Baseline source:** `ulmweb-branch` at `dae4edd7fcb1204d794f68dc4475ac149beb5cbc`  
**Status:** Teilweise im Browser ausgeführt. Die Ergebnisse unten halten ausschließlich die tatsächlich beobachteten Schritte fest. Die übrigen Schritte sind noch offen.

## Test setup

1. Check out or open the exact baseline commit, not a later working branch.
2. Serve the `game/` directory over a local HTTP server. Do not rely on opening the HTML file through `file://`, because the project uses JavaScript ES modules.
3. Open browser developer tools and select the Console and Network panels.
4. Record browser/version, operating system, commit SHA and viewport size.
5. Reload with cache disabled and record errors, failed requests and warnings.

## Smoke tests

| ID | Action | Expected observation | Result |
|---|---|---|---|
| F0-01 | Load `game/index.html` in the browser | Page shell, header, canvases and sidebar appear | **Passed (screenshot, 2026-11-04)** |
| F0-02 | Inspect console and network | No uncaught startup errors; all local ES modules load | **Partial: app loaded; card placement then raised a TypeError. DevTools also showed a CSP `eval` warning.** |
| F0-03 | Wait for initialization | Terrain appears, starting entities and first card are visible | **Passed (screenshot, 2026-11-04)** |
| F0-04 | Wait for simulation | Tick/calendar and resource displays update | Not run |
| F0-05 | Pause and resume | Simulation stops and resumes; rendering remains responsive | Not run |
| F0-06 | Select 1x, 2x and 4x | Relative simulation speed changes predictably; calendar/tick remain consistent | Not run |
| F0-07 | Drag the canvas | Camera pans without placing a card | Not run |
| F0-08 | Use mouse wheel zoom | Zoom remains anchored around pointer and stays within bounds | Not run |
| F0-09 | Inspect minimap | Discovered terrain and entities are drawn; viewport indicator is plausible | Not run |
| F0-10 | Place current card on valid terrain | Placement either succeeds or exposes a clear, reproducible failure | **Failed: `state.world` TypeError in `findNearestBuildableTile`; fixed in source, post-fix retest pending.** |
| F0-11 | Attempt placement on water/occupied/out-of-bounds terrain | Invalid placement is rejected safely and does not spend resources | Not run |
| F0-12 | Switch Event Log, Stats and Tech tabs | Each panel renders and remains interactive | Not run |
| F0-13 | Trigger or wait for a random event/raid | Event feedback appears and simulation continues without uncaught errors | **Partial: `FIRST RAID DETECTED` and `IT BEGINS TO RAIN` appeared in the event log; full interaction/console verification pending.** |
| F0-14 | Resize the browser window | Canvas dimensions and rendering adapt without errors | Not run |


## Captured browser environment and evidence

- Date: 2026-11-04
- Browser: Google Chrome (exact version not captured)
- Evidence: user-provided screenshot showing the loaded game and Chrome DevTools Console
- Confirmed error: `Uncaught TypeError: Cannot read properties of undefined (reading '77')` in `findNearestBuildableTile (cards.js:64:41)`, called from `placeCurrentCard (cards.js:85:11)`.
- Additional DevTools Issues item: the site's Content Security Policy blocks use of `eval`. Its source and impact were not established during this check.
- Post-fix browser verification has not yet been performed.

## Recording a failure

For each failed step, record:
- Test ID.
- Exact action and coordinates/conditions where relevant.
- Expected versus actual behaviour.
- Full console error and stack trace.
- Failed network request URL/status, if applicable.
- Whether the failure reproduces after a clean reload.

Do not fix defects while performing the baseline pass. The purpose is to capture the original behaviour first.

## Known issue to pay particular attention to

The baseline browser screenshot confirmed the `state.world` error. The placement implementation has since been repaired and moved into the unified source structure. F0-10 and F0-11 must now be repeated against the current development branch to verify the repair and guard against regressions.

## Exit condition

F0 is complete when:
- The exact baseline and browser environment are recorded.
- Every smoke test has a result, including tests that fail.
- Startup/runtime errors are captured.
- Known pre-existing defects are distinguished from regressions.
- The baseline notes are committed alongside the checklist.
