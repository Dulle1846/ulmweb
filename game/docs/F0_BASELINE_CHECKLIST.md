# F0 — Baseline Smoke-Test Checklist

**Purpose:** Record current behaviour before changing the prototype. This checklist is a manual browser procedure until automated browser tests are introduced.

**Baseline source:** `ulmweb-branch` at `dae4edd7fcb1204d794f68dc4475ac149beb5cbc`  
**Status:** Repository and source inspected; browser execution not yet performed.

## Test setup

1. Check out or open the exact baseline commit, not a later working branch.
2. Serve the `game/` directory over a local HTTP server. Do not rely on opening the HTML file through `file://`, because the project uses JavaScript ES modules.
3. Open browser developer tools and select the Console and Network panels.
4. Record browser/version, operating system, commit SHA and viewport size.
5. Reload with cache disabled and record errors, failed requests and warnings.

## Smoke tests

| ID | Action | Expected observation | Result |
|---|---|---|---|
| F0-01 | Load `game/index.html` through a local HTTP server | Page shell, header, canvases and sidebar appear | Not run |
| F0-02 | Inspect console and network | No uncaught startup errors; all local ES modules load | Not run |
| F0-03 | Wait for initialization | Terrain appears, starting entities and first card are visible | Not run |
| F0-04 | Wait for simulation | Tick/calendar and resource displays update | Not run |
| F0-05 | Pause and resume | Simulation stops and resumes; rendering remains responsive | Not run |
| F0-06 | Select 1x, 2x and 4x | Relative simulation speed changes predictably; calendar/tick remain consistent | Not run |
| F0-07 | Drag the canvas | Camera pans without placing a card | Not run |
| F0-08 | Use mouse wheel zoom | Zoom remains anchored around pointer and stays within bounds | Not run |
| F0-09 | Inspect minimap | Discovered terrain and entities are drawn; viewport indicator is plausible | Not run |
| F0-10 | Place current card on valid terrain | Placement either succeeds or exposes a clear, reproducible failure | Not run |
| F0-11 | Attempt placement on water/occupied/out-of-bounds terrain | Invalid placement is rejected safely and does not spend resources | Not run |
| F0-12 | Switch Event Log, Stats and Tech tabs | Each panel renders and remains interactive | Not run |
| F0-13 | Trigger or wait for a random event/raid | Event feedback appears and simulation continues without uncaught errors | Not run |
| F0-14 | Resize the browser window | Canvas dimensions and rendering adapt without errors | Not run |

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

The static audit found card placement reading `state.world`, while the reviewed state and terrain generator do not initialize that grid. F0-10 and F0-11 should confirm the runtime behaviour and capture the exact error before F1 changes it.

## Exit condition

F0 is complete when:
- The exact baseline and browser environment are recorded.
- Every smoke test has a result, including tests that fail.
- Startup/runtime errors are captured.
- Known pre-existing defects are distinguished from regressions.
- The baseline notes are committed alongside the checklist.
