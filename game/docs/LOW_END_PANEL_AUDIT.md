# Low-end panel audit (3.90.1)

The management deck is the part of Kings & Cards that grows most with a living
realm. This release makes its cost visible and keeps every newly added panel on
the same bounded mount path that was already proven on phones.

## What changed

- **One timing record per panel activation.** `window.__panelTiming` keeps its
  existing `panel` and `renderMs` fields and now also carries `staged`,
  `stages`, `mountedNodes`, `maxChunkMs`, `maxPartMs`, `maxParseMs`,
  `maxTaskMs`, `totalMs`, `complete` and a history capped at 64 entries. The
  Lexicon, which has its own renderer, is included.
- **More panels use staged mounting.** Government, Politics, World, Explore,
  Biomes, Forests, Decisions, Military, Stores, Buildings, City, Shadow Court,
  Dynasty, Creatures and Atelier join Realm, People, Nobility and Diplomacy.
  Chronicle keeps its dedicated timeline hydrator. The existing 4 ms per-frame
  work budget, node caps and card caps are unchanged; large record decks get a
  bounded card cap instead of mounting a whole court in one layout pass.
- **Less dead work per chunk.** The disabled culling observer was removed, so
  staged hydration no longer generates mutation records for a function that
  immediately returned. Every direct panel section owns content containment and
  Chromium skips off-screen archives without invalidating the scroll extent
  when a late record arrives. The desktop hydrator mounts two generic nodes or
  one record card per frame, the measured balance between too many native
  lifecycles and oversized ones.
- **Markup is generated in bounded parts.** The forest atlas, people register,
  stores, building register, World Map, City, Shadow Court, exploration and
  biome decks hand the staged hydrator a list of thunks and section descriptors.
  Up to six cheap parts share one bounded preparation task under an 8 ms JS
  budget; an unfinished producer can hand the scheduler its next slice instead
  of creating hundreds of empty placeholder frames. Preparation mutates no DOM,
  so it runs in its own `MessageChannel` task instead of sharing a long task with
  the native style and layout pass that follows a mount frame. The expedition
  grid arrives as one bounded section so its scroll extent changes once instead
  of four times. The Lexicon keeps its exact plain markup and uses the generic
  top-level splitter: its skip-contained record groups already make one bounded
  insertion cheaper than repeating the dialog layout for every group. Existing
  full-panel renderers are split on complete top-level sections, so the plain
  string API stays byte-identical while each parse is bounded.
- **Queued containers keep their own records.** A staged `into:` target is
  registered on the exact node the hydrator will mount, including nested row
  shells, so generated records never escape to the panel root while their shell
  is still queued.
- **The forest survey streams without changing the sample.** Its original
  strided sample, ordering and cache key are preserved. The survey advances one
  index slice or one sampled stand per frame and never publishes a partial
  result.
- **Staged completion is measurable.** `window.__progressiveTiming` now reports
  parts, preparation time, longest generated part, longest parse, the number of
  stages, mounted work units, longest chunk and total mount time. `maxTaskMs`
  is the maximum of generation, parsing and mounting.
- **Finished runs release their staging references.** The active-run record no
  longer keeps cloned shells, detached section targets or generated producer
  thunks alive after a panel completes or is cancelled, so switching through
  the whole deck does not make each later tab pay for an earlier archive's dead
  DOM or retained string buffers.
- **The 25-year gate keeps its 30-second budget.** Warehouse totals now follow
  direct writes incrementally and a validated geography is recognised without
  repeated helper calls. This removes test-only CPU contention from the
  campaign gate without changing the result of a single simulation tick; the
  unchanged proof completes in about 22 s inside the full parallel suite.

## Player impact

Panel switches may fill in over a few frames on a slow device instead of
freezing while a whole archive is laid out. The content, controls, focus
restoration and save state are unchanged. Keyboard players keep the same place
after a panel rebuild.

## Proof

```bash
npm run test:panel-audit
npm run test:keyboard
```

`tests/browser/low-end-panel-audit.mjs` starts a realm, pauses it, throttles
Chromium to 4x CPU, opens all 29 management tabs with real deck clicks and
checks:

- every panel completes hydration and renders real content;
- at least twelve panels use staged mounting and record multiple stages;
- markup generation stays below 100 ms and no hydration chunk produces a
  long task over 100 ms;
- the timing history is bounded and every entry is complete;
- no page or console errors occur.

The canonical `npm run test:performance:low-end`, `test:performance:advanced`
and `test:performance:eight-climate` budgets remain unchanged at 33 ms p95
frames, 0 long tasks in measured phases, 1000 ms save and 2500 ms load.
