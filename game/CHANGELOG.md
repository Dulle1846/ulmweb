# Kings & Cards — Version and Development History

**Current production version:** `3.58.0`
**Next development line:** `3.59.0-dev`
**Production branch:** `ulmweb-branch`  
**Game root:** `game/`  
**Production URL:** https://kings-and-cards.pages.dev/  
**Last repository verification:** 2026-11-25 (UTC)

This is the canonical release and change record for the game. It is intentionally stored at the root of `game/`, not buried in the technical documentation folder.

## 3.58.0 — Every wood has a species history, a seed source and a working system

The sixty regional forests named their species, but the canopy still kept the
generic base mix; age, seed source, genetic breadth, disease resistance and
silviculture were labels rather than stand properties. This release adds points
1.2.23.1.061–090 as one pure `forest-dynamics` view over the existing
`forestStandAt()` contract. No second map, save type or per-tick loop was added.

- **Fifty-six species, fourteen explicit traits.** Every tree in `FOREST_SPECIES`
  now carries pioneer, shade, drought, wet, disease, fire, wind, root, litter,
  mycorrhiza, coppice, graze, longevity and cold values. Regional species are
  blended into the actual stand at 60% regional / 40% local, so an oakwood keeps
  its oak plurality while the regional set owns most of the canopy. Pure islands
  remain real monodominant patches.
- **Composition becomes a contract.** `composition` reports purity, dominant
  share, evenness, diversity, pioneer/climax shares, pioneer and climax species
  and four mixture classes from pure to even. `age` reports the six succession
  phases from pioneer thicket to old-growth/climax, plus a management rotation.
- **Regeneration has a source.** A seed bank survives disturbance, mother trees
  produce higher-quality seed, genetic breadth lowers inbreeding risk, and the
  resulting `regeneration.factor` is multiplied into the existing bounded
  regrowth slices. Disease resistance, drought/wet/cold stress and site fitness
  are species- and site-specific; they now modulate fire, pest and wind risk and
  the stand's productivity within tight caps.
- **Six working silvicultural systems.** Coppice, coppice-with-standards, high
  forest, selection forest, continuous cover and wood pasture classify from the
  existing formation, uses and canopy. Rotation, timber factor, regeneration
  factor and browse pressure are real: the Lumber Camp and thinning multiply the
  management timber factor, wood-pasture browsing slows regeneration, and the
  atlas/inspector display the same record.
- **Structure and soil are visible and edible.** Edges and clearings raise edge
  diversity and create light woodland with canopy gaps. Lianas and epiphytes
  follow moisture, age and tropical profile, add withies/rattan/moss/lichen/
  orchids to the gathering list, and are drawn as climbers and trunk patches at
  close zoom. Shrub, sapling and herb layers feed browse, medicine and habitat.
  Root depth, water uptake, litter quality, mull/moder/mor humus, decomposition
  and mycorrhiza networks are explicit per-species values; mycorrhiza improves
  regeneration, disease resistance and mushroom availability.
- **No new save state, bounded cost.** `dynamics` is derived on read and replayed
  deterministically. The trait calculation is O(species per tile) with no
  neighbour scan; the existing 400-day ecological slice and Lumber Camp cache are
  preserved (the cache now also stores the stable timber factor and system).
- **Documentation.** The full 30-point mapping, derived contract, real effects,
  save/performance rules and tests are in
  [docs/FOREST_DYNAMICS.md](docs/FOREST_DYNAMICS.md).

**Verification (2026-11-25):** focused forest, pressure, regional, mixed,
conifer, gathering, atlas and new dynamics suites pass 48/48; the full
`npm test` suite passes **1,450/1,450**. The deterministic 25-year campaign is
**ok:true** at **10,040 ticks**, **19,213.8 ms**, **1.175 ms/tick**, 72 residents,
18 houses, all 13 ambitions, every requirement true, 3,507 forest tiles,
0 untyped, 23 real fuel-backfill orders with max 1 per phase, and no game over.
The tropical browser reference passes with **9,526 forest tiles**, **0 untyped**,
**60 atlas cards**, **18 timber-market rows**, three distinct rendered stands,
the ten-cell ecology block, the liana/epiphyte inspector line, and no console or
page errors. `npm run spec:audit` reports **1,616/1,618 implemented** across 38
sections; only 4.0.1 and 4.0.6 remain open. Both live hosts were checked after
the production deploy.

## 3.57.0 — Regional forests become places you can feel

The sixty regional forests were visible and named, but four of their seven
effects only changed inspector text: timber, forage, work and flood did not touch
a single harvest, batch or loss. The atlas also stopped at a palette strip. This
release makes every published value do work, gives each type a character and a
signature crop, and makes the borders between two forests tangible.

- **All seven effects now bite.** `timber` scales the Lumber Camp batch, the
  thinning yield and the wood share of a gathering visit within 0.70–1.35;
  `forage` scales plant and game harvest within 0.75–1.35; `work` feeds the
  gathering work factor within 0.70–1.15; `flood` raises gather spoilage by up to
  12% of its value and deepens site wetness. `regrowth`, `fire` and `fauna` stay
  on their existing paths. The numbers shown in the atlas are the numbers the
  simulation uses.
- **Sixty characters, sixty signatures.** A frozen `REGIONAL_FOREST_CHARACTER`
  record gives every type three field marks, one signature good and one bounty
  season. The gatherer always offers the signature good and pays +1 unit in its
  season, with a `SEASONAL BOUNTY` toast and ledger entry. Moss, crab,
  serpentine stone and dune grass became real goods; six phantom names were
  mapped onto registered goods so no card promises what the ledger cannot give.
- **Borders are real belts.** `regionalForestSelectionFor()` adds a deterministic
  second type near a temperature, moisture or elevation window edge, with a
 0–50% share. The primary type keeps the tile, stock and save data; the edge
  adds character, up to +6% habitat and a mixed ground palette. No neighbour
  scan and no third biome were introduced.
- **The atlas and inspector tell the story.** Cards show field marks, signature
  good and `IN SEASON`, plus a per-type `EDGE` count and a `TRANSITION EDGES`
  summary. The site inspector names the transition, signature and season and
  prints Work and Flood; the harvest toast calls out the seasonal bounty.
- **Bounded cost.** The Lumber Camp caches the immutable regional share per
  seed and tile instead of rebuilding a stand after every batch. The 25-year
  campaign stays at 0.977 ms per tick, 10,040 ticks, 3,507 typed forest tiles,
  0 untyped, 176 regional timbers and no game over; the temperate reference world
  shows 419 transition tiles among 4,168 forest tiles. The browser reference
  passes sixty atlas cards, eighteen market rows and the new inspector text with
  no console or page errors.

## 3.56.1 — Rain-shadow forest keeps the Forester harvest whole

The sixty-type overlay moved the ten-year stewardship site from montane mixed
wood onto rain-shadow forest. At 74% timber the site removed 3,944 stock against
the unchanged >4,000 gate. The rain-shadow type now yields 84%, still below the
montane forest it borders, and the exact failing seed clears the gate at 4,167;
the other seeds remain at 4,722 and 4,919.

- **One value, one cause.** No threshold, tick count or harvest action was
  weakened. The rain-shadow palettes, window, priority and species mix are
  unchanged; only its timber yield moved.
- **Verification.** Full suite passes 1,436 tests; the three-seed ten-year
  Forester audit is green; the 25-year campaign still reports 3,507 typed forest
  tiles with 0 untyped and no game over.

## 3.56.0 — Thirty regional forest subvariants and transitions

The regional forest layer covered broad belts; it did not yet distinguish the
places where one belt turns into another. This release adds points 031–060 from
1.2.23.1: coastal and mountain fog, two floodplain water chemistries, delta and
lagoon mangroves, cold slopes and rain shadows, steppe, semi-desert islands,
oases, volcanic ash, serpentine and karst, dunes and salt soils, gravel bars,
loess and clay, bog birch and alder carr, willow, ash-elm and poplar floodplains,
hazel scrub, juniper heath, dwarf-pine krummholz and the treeline pioneer wood.

- **One catalogue, sixty types.** `REGIONAL_FOREST_TYPES` now holds all 60 with
  distinct site windows, priorities, species mixes, goods, fauna, palettes and
  silhouettes. The selector, inspector, forest atlas, resource ledger, sawmill,
  timber yard and market read the same records; there is no parallel forest
  model. The 30 new types are reachable in a generated world, not just on paper.
- **Two named timbers complete the riparian frontier.** Poplar and tamarisk are
  appended species with their own `poplar-timber` and `tamarisk-timber` goods,
  sawmill batches and market rows. The 18 regional timbers remain appended after
  the ten original goods, so old saves and goods indices are untouched.
- **Tighter ecological layering.** Delta mangroves at the lowest heights, lagoon
  mangroves above them, then blackwater and whitewater floodplains; cold-slope,
  karst and serpentine forests split the montane belt; loess, clay, hazel and
  steppe split the temperate lowlands. Each window keeps 001–030 reachable.
- **Atlas and proof.** The FORESTS tab now lists sixty cards, and the browser
  reference checks all sixty plus eighteen market rows. The unit suite checks
  every documented probe, differentiated effects/palettes, an untyped-tile-free
  world, a nine-climate sweep that observes all sixty types, and a save/load
  round trip. The deterministic 25-year campaign and browser reference are part
  of this release's verification.

## 3.55.2 — Management deck has one source of truth

The management deck's 29 tabs were duplicated between `index.html` and every
browser harness. One exploration audit still expected 23, so it failed after the
night shift added six panels even though the game itself was healthy. This
release removes the duplicate and makes the exported contract the thing both the
UI and the audits read.

- **One exported list.** `js/presentation/management-tabs.js` now owns every tab
  id, label and emblem. `setupManagementUI()` renders both the tab grid and the
  narrow selector from it, and `index.html` no longer keeps a second copy.
- **Audits stop guessing.** The Explore harness imports `MANAGEMENT_TABS`, checks
  the full id, order and label set plus the narrow selector, and proves every
  button remains inside an unclipped deck at 820x1180 and 1440x900. The world-map
  and main browser E2E checks use the same contract instead of a literal count.
- **Expeditions still play through.** The same run launches a named leader with a
  grand supply, waits for the outbound party to return, checks one history report
  and one lore fragment, and confirms the expedition survives the save snapshot.
- **Mature panel audit follows the live data.** The population check now reads
  the citizen register (soldiers included) instead of the housing-only villager
  count, and the justice check waits for every pending case row before reading
  it. No tolerance, viewport or save/load requirement was reduced.
- **Long journeys use the required sizes.** The player journey's final layout
  probes now run at 1440x900 and 820x1180; the 100-year scholar journey completes
  eight expeditions and seventeen technologies with no mature-panel findings.
- **Verification.** The full suite passes 1,434 tests with no failures, the
  Explore deck audit is green at 820x1180 and 1440x900, and the 60 FPS
  playability audit remains green.
- **The Kingdom Overview tells the truth about territory.** The stale claim that
  no authoritative territory or capital values exist is replaced with a live
  `SEAT NETWORK` readout: chartered seats against the cap, bounded territory
  radius, and the deterministically oldest seat with its coordinates and charter
  year. The copy states plainly that there is no separate capital field instead
  of inventing one. Desktop and narrow world-map browser checks now assert the
  new section.
- **The founding overlay stays inside its first-frame budget.** Splitting the
  muster out of `warmMilitaryCaches()` initially added unrelated diplomacy and
  crown-dread reads to startup, which kept the start screen visible past the
  core-loop audit's founding window. The warm-up is local again; the explicit
  opening muster still runs once before the overlay lifts, and loaded saves are
  still untouched.

## 3.55.0 — Night shift: eight new chronicles and living noble succession

The realm already had thirteen authored three-stage story arcs, but a dozen live
event families could still only produce a single issue and a quick resolution.
This release gives eight of those families their own complete chronicle harvest,
discovery, storms, taxation, the frontier, faith, invention and monster hunts. Each
arc has three stages with two meaningful decisions, and the endings feed real
cards, political factions and hidden realm pressures through the existing event
ledger.

- **Eight long-form arcs, twenty-four new stages.** Every new chain is anchored
  to an event family that can actually generate it, so the writing is reachable
  in play rather than dead data. No new random stream was introduced: the arcs
  attach to existing families, so runs stay deterministic and saves stay compatible.
- **Consequences that already matter.** Choices spend or gain the four existing
  resources, shift commons/nobility/guilds/clergy/legitimacy, and leave prosperity,
  tension and mystery in the realm memory. Final decisions secure existing card
  categories: warehouses, gold mines, blacksmiths, border rangers, reliquaries,
  clockmakers and griffins.
- **Noble houses keep their line.** The new arcs reshuffle the event stream, and
  the fixed 25-year sweep exposed a house whose last member simply died while the
  house record lingered as a permanent dormant entry. An extinguished house now
  confirms a resident heir through the normal annual audit: dues, levy, head and
  history all continue without a new save field, a new random stream or any extra
  per-tick work. The gate still demands four living houses in all eight seeds.
- **Contracts.** The chronicle suite now checks the new arcs, their endings and
  their family anchors; the nobility suite checks the heir succession. The full
  test suite and production deploy remain green.
- **Night batch 2 — four more everyday chronicles.** Caravans, common fevers, road
  bandits and the lantern festival now continue for three stages instead of ending
  with one issue. Their decisions use the existing resource, health, political and
  hidden ledgers; the final choices secure merchant stalls, healers' rounds,
  watchtowers or festival weeks. All four ids are anchored to live generator
  families, so the arcs are reachable without a new save field or random stream.
- **Night batch 3 — the chronicle library is complete.** Noble feuds, master crafts,
  heavenly omens, winter and pilgrimage now each run for three authored stages
  instead of ending with a single issue. Every decision changes existing resources,
  political factions and hidden pressures; winter choices also alter the health
  ledger. The five endings secure noble houses, craft fairs, dream omens, winter
  stores and pilgrim hostels. All five ids are live generator families and the
  reward categories are asserted to instantiate, so no save field, random stream
  or per-tick cost was added.
- **Night batch 4 — event outcomes explain themselves.** Resolving an issue now
  appends one compact line of plain consequences to the existing resolution entry:
  signed resource and faction changes, morale, and the direction of hidden pressure.
  Card rewards now say they are queued for the next draw, and a full archive says
  to draw a card to make room. This reuses the shared event log and card queue with
  no new save field, ledger or per-tick work.
- **Night batch 5 — The Hearth Census scenario.** A sixth authored opening uses
  the population objective: welcome thirty residents before the spring census in
  year three, with new roofs and a steady granary as the path to victory. It uses
  the existing scenario start, live population register, reward path and save
  format; no new field, stream or per-tick work was added. The scenario browser
  reference now waits for the progressively rendered panel to hydrate before
  reading it, so a slow frame cannot produce an empty briefing.
- **Night batch 6 — The Consent of the Realm.** The endless chronicle gains one
  more deed: raise crown legitimacy to at least 85, paid once in gold and food and
  followed by another deed. It reads the existing political state on the same
  20-tick cadence, saves only its deed id and target, and leaves the royal ladder,
  save schema and per-tick cost untouched.
- **Night batch 7 — The Atlas of the Realm.** The endless chronicle gains one more
  deed: survey two to six additional biome regions, paid once in gold and stone and
  followed by another deed. It reads the existing world atlas on the same bounded
  20-tick cadence and leaves the save format, royal ladder and per-tick cost untouched.
- **Overnight work log.** `docs/NIGHT_SHIFT_2026-11-25.md` records each batch of
  this night shift and its verification.

## 3.54.0 — Keyboard play, honest controls and faithful realm settings

The map was strictly pointer-driven, a visible settings control had no effect,
the shortcut list promised keys that were never wired, and a chosen hour or an
open settings dialog could silently snap back. Locally authored scenario names
could also inject markup into a completion banner. This release makes the
player-facing controls truthful and keeps realm presentation faithful across
new games, loads and benchmarks.

- **Keyboard map controls.** Arrow keys or WASD pan the camera by a bounded step
  and clamp to the world edge; Enter/Space places the selected card on the
  centre tile. `P` pauses, `1`–`4` and `+`/`−` change detail level, `?` opens the
  help sheet, `Ctrl/Cmd+S` and `Ctrl/Cmd+O` use the real save/load buttons, and
  Esc also dismisses a realm issue. Text fields, open dialogs and focused
  controls keep their own key handling; repeated Enter presses cannot place
  twice. The mapping is a pure presentation module with focused unit tests.
- **Honest resource-badge setting.** The settings toggle now initialises from
  the saved `showDeltas` value, applies the CSS class immediately and persists
  every change, matching the neighbouring tooltip and motion controls.
- **Persistent time of day.** The hour is saved both as a setting and in the
  realm snapshot, restored by legacy and current saves, and validated on
  import. Dusk and night no longer snap back to noon when a realm starts or
  loads, so the renderer, construction and hazard profiles stay faithful.
- **Truthful benchmark and settings.** A disabled benchmark now says to start
  or load a realm, or reports a renderer fault, instead of claiming it found a
  realm. Once a realm is live, that stale blocked hint is replaced by a ready
  hint while completed-run messages stay intact. Closing settings during a
  benchmark requests cancellation and is no longer undone when the run finishes.
- **Safe scenario banners.** Custom scenario names are HTML-escaped before they
  reach the completion message, so local scenario text can no longer inject
  markup. Authored help text still uses HTML where intended.
- **Bounded logistics work.** Warehouse free-space checks normalise an entity
  once instead of three times per query; stock, reservation and capacity rules
  are unchanged.
- **Player check.** The new controls, settings persistence and benchmark states
  are covered by focused contract and save round-trip tests. The local build
  was played in Chrome without console errors: arrow keys and WASD panned the
  camera, `P` paused, `1`–`4` changed detail level, `?` opened the help sheet and
  Esc dismissed overlays. An 18:00 hour stayed at 18:00 through save and reload,
  the benchmark switched from blocked to ready when a realm started, and the
  browser E2E now waits for panel content that CSS intentionally skips while it
  is off-screen.

## 3.55.1 — Browser setup survives a flaky apt mirror

The 20-year endurance job failed its first attempt in setup, before a single
realm opened: `playwright install --with-deps chromium` ran one all-or-nothing
apt transaction, and the mirror could not locate optional font packages such as
`fonts-unifont`, `xfonts-cyrillic` and `fonts-freefont-ttf`. The rerun only went
green because the cached browser made setup skip apt entirely. That is a
workflow-setup defect, not a test result.

- **Verify before installing packages.** Chromium's binary now installs first
  and must pass the existing launch plus native-text-input probe before apt is
  touched. A runner whose base libraries are sufficient no longer depends on an
  optional font mirror at all.
- **Retry the real dependency install.** When the probe fails, Playwright's
  system dependencies are installed with up to three attempts and refreshed apt
  indexes between failures.
- **Font-free fallback with proof.** If a mirror still cannot satisfy the full
  font list, setup installs Playwright's exact runtime package set without
  optional `fonts-*`/`xfonts-*` packages, keeps `fonts-dejavu-core` when
  available, and then requires the same Chromium launch/input probe to pass. A
  browser that cannot actually render a native input still fails the job.
- **No gate weakened.** All nine browser jobs remain, the endurance audit still
  runs 20 years, and there is no skip, `continue-on-error`, reduced year count
  or non-blocking job. The change is limited to the shared browser setup action
  and its setup script.
- **No game change in the setup work.** Save format, deterministic simulation,
  rendering and per-tick work are untouched by that CI fix.
- **A load no longer settles an old muster.** `warmMilitaryCaches()` was meant
  to be a pure startup warm-up but still called the annual muster resolver. A
  save whose muster year lagged its calendar year (for example one written at a
  year boundary) silently lost gold and food and aged soldiers on load. Loading
  now primes only the memoized reads; a new explicit `settleOpeningMuster()`
  keeps the founding muster before the start overlay, and later musters stay in
  the normal annual loop. The Whisper Court browser proof now checks that the
  treasury, garrison service years and muster year survive a reload exactly.

## 3.53.4 — Quotes, orders and quests tell the truth

The 3.53.3 player pass never actually used the city building, market, realm
issue, noble host, garrison or expedition controls. This pass drove those
surfaces at 1440 × 900 and 820 × 1180, and closed the tablet save-slot and
desktop year-rollover evidence gaps. Two controls were lying and one stale
toast survived a realm switch:

- **Exact market quotes.** Trade buttons now show the gold the next settlement
  will really charge or pay, including pacts, health, faith, court, research,
  debt, spies and weather. Base prices stay on the row labelled `BASE`, and the
  note explains why the row and the button can differ. Settlement arithmetic
  is unchanged; both now read one shared quote path.
- **Truthful noble orders.** A quartered land host shows a disabled `AT HOME`
  instead of an enabled `RETURN HOME` that did nothing, and a returning host
  shows a disabled `RETURNING`. Mustering and returning hosts say `NEXT ANNUAL
  AUDIT` instead of a tick countdown the annual simulation never fulfilled.
- **A load clears the previous realm's toast.** Loading while `TRADE COMPLETED`
  was still visible used to leave that action message over the newly loaded
  realm. The toast is cleared on a successful load; the save status and
  `SAVE LOADED` event-log entry carry the confirmation.
- **Player checks.** At 1440 × 900 a cottage charged 5.5 wood + 2 stone and
  completed at tick 1635 with capacity 28 → 32; its stone upgrade cost 42 gold
  and raised capacity 26 → 28; demolition returned 8 wood + 2 stone. A city
  event cost 9 wood + 5 stone and cleared the active event, a realm issue cost
  5 gold with `REALM ISSUE RESOLVED`, and a Sunken Ruins expedition cost 12 gold
  + 37 food, returned 36 gold + 18 stone and one survey. At 820 × 1180 a tent
  cost 2 wood + 0.75 food, completed with capacity 26 → 28, upgraded for 42
  gold to 28 → 30 and demolished for 2 wood + 2 food. Garrison equipment cost
  11 gold + 6 wood, added 14 equipment and readiness 63 → 65; a warhorse cost
  22 gold + 10 food and raised mounted power 26.4 → 31.6. Survey and omen atlas
  decisions spent their stated 4 food + 2 gold and 3 food, paid their rare-good
  and 10-gold rewards and reported `ATLAS QUEST RESOLVED`.
- **Save and year evidence.** The tablet save slot round-tripped tick 1815 with
  gold 148.5192345772846, wood 376.2638047112622, stone 335.5621014854731 and
  food 301.8165879180918 exactly. A desktop year 5 → 6 rollover showed `YEAR 6
  / SPRING` in the HUD, a `YEAR 6 · DAY 2` living notification, year-6 noble and
  civic audits and the year-6 `The Missing Ledger` issue.
- **No save or simulation change.** No save field was added or changed and the
  deterministic simulation, resource costs and annual schedules are untouched.

## 3.53.3 — A placed card says so

A desktop drag placed the selected card, consumed it from the hand and wrote the
play to the log, but the toast kept saying “CARD SELECTED — DRAG OR TAP IT ONTO
THE MAP.” Touch placement already changed to “CARD PLACED”, so desktop was
telling the player the opposite of what had just happened. A successful drag now
shows the same placement toast, and the placement status falls back to the
placed/next-card prompt instead of the selection prompt.

- **Truthful drag feedback.** The pointer-up path reports `CARD PLACED` only
  after `placeCurrentCard` succeeds. Failed drops keep the selection prompt.
- **Regression guard.** Browser E2E now asserts the toast after the real desktop
  drag placement.
- **Player check.** At 1440 × 900 a drawn `EMBASSIES OF WINTERFELL` was dragged
  onto a legal tile: hand 1 → 0, gold 137.169 → 132.169, food 313.329 → 309.329,
  the selection cleared, and the toast read `CARD PLACED`. At 820 × 1180 the
  separate touch path already reported `CARD PLACED` and is unchanged.
- **No simulation or save change.** Card selection, placement rules, costs,
  effects and the deterministic simulation are untouched.

## 3.53.2 — The desktop ledger stays in reach

At 1440 × 900 the administration sidebar held 1,046 px of content inside a
730 px column while its overflow stayed visible. The Selected Card inspector,
the Event Log tabs and the panel footer were painted below the action dock with
no way to scroll to them, so a desktop player could draw a card but not reach
the surface that explains or places it. The panel now scrolls on desktop; the
tablet and phone document-scroll layouts are unchanged.

- **Desktop sidebar scroll.** The 352 px column keeps every ambition, room and
  card section and gains a contained vertical scroll path. At maximum scroll the
  card, tabs, tab content and footer sit above the action dock. No save field,
  simulation state or rendering path changed.
- **Readable dock hints.** The five toolbar tooltips were shrink-to-fit against
  the 59 px of space left of their anchor, stacking labels one word per line.
  They now use `max-content` up to 220 px and paint above the event bulletin
  (z 980) while staying below modal dialogs. `ISSUE OPENED` replaces the false
  `DECISION RECORDED` toast when an active realm issue is reopened.
- **Player check.** The real build was driven at 1440 × 900 and 820 × 1180
  through the start screen, map, army panel, diplomacy gift, a drawn card,
  event choice, save/load, pause and all four speeds, and notifications. No
  horizontal overflow, clipped controls or console errors were found on the
  reviewed surfaces; the desktop sidebar and tooltip findings above were fixed.
  The existing UI contract suites now assert the desktop scroll and tooltip
  layers plus the corrected issue toast.

## 3.53.1 — The mobile map holds still

On a phone, the world stage was sized with `dvh`. When the browser address bar
hid while the page scrolled, the stage grew by about 33 px, the canvas was
resized and everything below it reflowed — the visible screen shake players
reported. The phone layout now uses the stable small viewport (`svh`, with a
`vh` fallback) for the map and shell, and the page refuses overscroll bounce, so
scrolling no longer drags or resizes the realm. The Settings plate also reports
the real release version instead of the stale `v3.14.2` marker.

- **Stable phone stage.** `48svh` with a `48vh` fallback replaces `48dvh`;
  `100svh` with `100vh` replaces the dynamic shell minimum. The canvas keeps its
  size while browser chrome appears or disappears.
- **No page drag.** Mobile `html, body` use `overscroll-behavior-y:none`, so a
  pan that reaches a page edge cannot rubber-band the whole game shell.
- **Player check.** The real game was driven at 390 × 844 through founding, the
  map, Management (Realm, People, Nobility, Diplomacy), Build and Settings. No
  screen had horizontal overflow, clipped controls or console errors.

## 3.53.0 — Heavy panels open without a hitch

3.52.0 left the low-end cold-start harness flaky: opening Population, Nobility
and Diplomacy on a mature realm produced real 52–75 ms main-thread stalls. The
work was synchronous layout and styling after each panel inserted its full
markup, not snapshot aggregation or simulation (panel render work measured only
4.8–12.9 ms). This release removes those stalls without weakening any gate.

- **Staged desktop hydration.** The existing progressive renderer now drives
the four heavy commands (`kingdom`, `population`, `nobility`, `diplomacy`) on
desktop as well as phone. Lightweight filter and summary blocks are split at
eight descendants. Record cards stay atomic up to 96 nodes; cards above 24
nodes mount as a shell plus two batches, and the 45-node realm cards use four,
so no single task carries a whole mature record. Population cards may mount in
fours, while noble cards are limited to one per frame.
- **Containment where it belongs.** The management scrollport is now a strict
containment root, so appending a card no longer relayouts the whole command
modal. Noble houses, population registers and the diplomacy deck use wrapping
flex instead of auto-fit grids; a new card no longer reflows every sibling or
recomputes grid tracks. The noble card keeps all of its information in a more
compact DOM. No second render path, aggregation layer or save field was added,
and the simulation stays deterministic and save-compatible.
- **Contract unchanged.** Long-task budgets, FPS targets, render scale, years and
tolerances are untouched. Panel browser checks dispatch the visible tab's click
event directly, so Playwright's own scroll/actionability layout is not charged
to the panel; the app's handler, parse and hydration are still fully measured.
Existing browser tests wait for the staged interactive content instead of static
header text.

## 3.52.0 — The regional woods become real

3.51.0 catalogued the 30 regional forests. 3.52.0 makes their **16 named
timbers fully playable** without touching the old log chain, adds the forest
types atlas and gives every settlement a visible regional building form.

- **Timber is a real good.** The 16 regional timbers sit after the existing
  goods, so every old goods index and recipe is unchanged. The sawmill keeps
  its exact `2 logs → 2 planks + 1 firewood` recipe and additionally accepts
  two units of regional timber for 1–3 planks plus firewood; stored regional
  wood is preferred, logs remain the fallback, and every fifth delivery asks
  for regional stock so the chain cannot deadlock. The lumber camp drops one
  unit of its site's signature timber every five production batches when
  output space and the storage cap allow it. Foresters keep named deliveries
  named; generic `timber` still becomes `logs`.
- **Warehouse chain and market.** Timber yards accept all 16 timbers with a
  stock target of 18 each; legacy yards with the old three filters migrate on
  load while genuine custom filters survive. `regional-timber-market.js`
  quotes each wood from its density, climate, the existing wood price, the
  season and the real warehouse stock. The STORES tab lists all 16 rows; SELL
  moves five unreserved units out of real warehouses, books the movement and
  pays gold. With no stock there is no payout, only a reason. Old saves gain
  empty timber slots and load unchanged.
- **Forest atlas and building forms.** A new FORESTS command tab lists all 30
  regional types with palette, profile, effects, named timber, species and
  goods; the bounded survey samples at most 240 forest tiles and is cached by
  seed, year, tick and type. Seven regional building forms (timber frame, log,
  plank, stilt, stone-footed, thatched, turf) follow climate and terrain,
  redraw wall/roof/silhouette accents and scale the hearth interval through a
  real insulation factor. Forms are derived, cached and add no save field.
- **Gates.** The 25-year campaign (seed 20261108) stays green: 10,040 ticks,
  1.237 ms/tick, 3,507 typed forest tiles, 0 untyped, 66 regional timbers
  produced, 2 stored (cork), old log chains intact. The browser reference
  founds a tropical realm, checks 30 atlas cards, opens the Mangrove and
  Redwood timber lines, deposits 6 Mangrove Timber, sells 5 for +22 gold and
  leaves 1 in store. Focused suites cover economy, logistics, forms and atlas;
  the full sharded `npm test` reports **1,410 passing tests** and syntax/imports
  for 217 source files with 253 UI ids.

## 3.50.0 — The world beyond the realm

Roadmap 4.0.2 closes with the **World Map**: a WORLD management tab over the
real settlement seats and four diplomatic realms, standing annual caravans, and
saved frontiers that follow treaties and can put raiders over the border. The
audit moves from **1615/1618 to 1616/1618**; 4.0.1 and 4.0.6 remain open.

- **A map the player can open in normal play.** The WORLD tab sits beside
  DIPLOMACY in Realm Management. It draws the four neighbouring regions at their
  compass bearings, every real settlement seat at its actual world position, and
  every standing route between them. Each region card reads the existing treaty,
  relation, trust, specialty, ruler and frontier band. At 390 px the map, cards
  and selects stay inside the viewport with no horizontal overflow.
- **Trade routes are real caravans.** Pick a settlement depot, goods (wood,
  stone or food) and flow (import or export), then pay 15 gold and 8 wood to
  charter the route. Once per year the caravan moves six units through the same
  market stock, partner treasury and market prices manual trade uses. Timber and
  stone unload into that settlement's own stores, which its road-repair
  obligation spends; food uses the royal granary. Exports draw the named depot,
  pay the crown and leave the settlement up to 2 gold as a handling fee. War
  closes the route without moving goods; peace reopens it on the next survey.
  At most six routes may stand at once, and every caravan calls the existing
  `recordTradeInfluence`, so relation, trust, trade volume and the realm record
  move exactly as they do for a manual market sale.
- **Frontiers follow the existing court.** Pressure is one bounded reading of
  treaty (+42 at war, +18 neutral, +7 trade, +1 alliance), low relation and
  trust, nearby settlement seats, watch levels, active caravans, the standing
  army's existing dread and the existing crown border levy. The player can raise
  a three-step watch at 12 gold per step; each level cuts pressure by 9. Above
  58 pressure a deterministic raid may cross, above 75 it is certain. A raid
  takes at most one wood, one stone and one gold from the nearest seat (or two
  food from the crown when no seat is in reach), lowers relation and trust,
  raises fear, writes `lastIncidentYear` for the existing diplomacy levy, and
  spends 12 pressure for the following year. No shared random stream is drawn.
- **Bounded and saved.** `updateWorldMap` is one annual task after diplomacy,
  the settlement grant and the road survey: four regions, at most six routes and
  the existing seat list. It adds no per-tick or per-frame work and no second
  ecological pass. Save schema 15 stores routes, four frontier entries
  (pressure, watch, relief, incidents, years), a 24-entry history and totals.
  Schema-14 saves migrate to a quiet map and keep playing; routes and watch
  levels survive an exact save/load round-trip.
- **Gates.** `tests/systems/world-map.test.js` covers route validation,
  import/export movement, war closure, watch cost and pressure, a certain raid,
  malformed data, schema-14 migration and normalized round-trips. New
  `tests/browser/world-map.mjs` founds a real realm, opens WORLD through the
  normal deck, charters a route with the real controls, raises a watch, runs the
  annual survey, verifies the moved goods in live market and seat stores, saves
  and reloads, and repeats the panel at 390 × 844. The full suite reports
  **1,388 passing tests** (syntax/imports 213 files, 253 UI ids); the
  deterministic 25-year campaign completes every requirement and ambition at
  **10,040 ticks / 0.799 ms per tick**; the browser reference finishes with zero
  page or console errors and zero narrow overflow. `npm run spec:audit` reports
  **1616/1618**.

## 3.49.0 — The realm begins on your terms

Roadmap 4.0.4 closes with **Chronicle Scenarios**: five ways to found a realm,
a local custom editor, and one live objective that reads the same stores, people
and politics the player already manages. The audit moves from **1614/1618 to
1615/1618**; 4.0.1, 4.0.2 and 4.0.6 remain open.

- **Five authored openings.** Free Realm keeps the classic founding untouched.
  The First Winter begins in a northern autumn with 70 food and must reach 150
  food by spring of year 2. The Empty Granary begins in summer with 20 food and
  240 gold, and must reach 180 food before winter of year 1. The Broken Crown
  begins at 26 legitimacy and must reach 60. The Green Frontier begins in an old
  forest and must survey six biome regions. Each preset carries its own date,
  stores, morale, legitimacy, reward, failure consequence and recommended
  climate; the recommendation reaches the existing World Forge, while terrain
  and climate generation stay with the normal world options.
- **A custom opening, authored in the browser.** The start screen editor accepts
  name, briefing, climate, season, four stores, morale, legitimacy, objective
  (food, population, legitimacy or surveyed regions), target and deadline year.
  Entries are validated, normalized again on read and stored in a versioned
  `localStorage` envelope capped at six. A broken entry cannot reach generation.
- **The objective is a real consumer, not a counter.** `updateScenario` runs from
  `finishDailyRealm` at most once per calendar day. It reads actual food, the
  population register, actual political legitimacy and discovered biome regions.
  Completion pays its reward once; a missed deadline applies its consequence
  once. Both write a legacy/chronicle record and a player message, so morale,
  treasury, politics and history visibly move together. No per-frame work and no
  second ecological pass were added.
- **Readable in normal play.** A calendar HUD shows the scenario name, current /
  target and deadline; the Kingdom Overview card shows the full briefing, a
  progress bar, starting stores, morale/legitimacy, reward, failure and the last
  four outcomes. The card sits above the realm-at-a-glance block, not below the
  fold. At 390 px the picker, HUD and panel stay inside the viewport with no
  horizontal overflow.
- **Save schema 14.** The scenario block stores the full normalized definition,
  status, progress, evaluation day and a 12-entry history. Schema-13 saves
  migrate to `scenario: null` and load as Free Realm, never receiving a
  retroactive objective. The existing save round-trip now runs through schema
  14; a custom scenario survives save and reload with the same id, status and
  target.
- **Gates.** `tests/systems/scenario.test.js` covers the catalog, bounds, start
  path, one-shot completion/failure, migration and library cap. New
  `tests/browser/scenario-start.mjs` selects a preset, authors and saves a custom
  opening, founds it through the real start screen, checks live stores and
  legitimacy against the card, saves and reloads, and repeats the reading at
  390 × 844. Desktop and narrow runs finish with zero page or console errors.
  The full suite reports **1,380 passing tests**; the deterministic 25-year
  campaign completes all requirements and ambitions. `npm run spec:audit`
  reports **1615/1618**.

## 3.48.1 — The seasons reach the ground, the haze costs one blit

A player-view audit of all twelve biomes found two things the 3.48.0 sheet hid:
the sky haze rebuilt a full-screen radial gradient every frame, and autumn and
winter met the eye as almost the same green field because the seasonal wash was
nine to sixteen percent and the close grass pen stayed green.

- **The atmosphere is cached, not recomputed.**
  `biome-identity-render.js#hazeSpriteFor` renders the biome/season vignette once
  per canvas size and reuses one offscreen sprite. The per-frame path is now a
  single `drawImage`; a biome or season change rebuilds it, a camera pan does
  not. The cache holds only the current view, so a journey across many biome
  edges cannot grow it without bound.
- **Snow and leaf turn both count.** `seasonalTintOverlay` used a max() chain
  that discarded the foliage signal at the first snowflake. It now adds snow and
  foliage and gives the dormant winter face its own floor. The close ground pen
  follows the same state: ochre litter in autumn, grey-straw stubble and frost
  in winter, no yellow flower dots on dormant ground.
- **Winter no longer grows flowers.** The landmark plant vignette keeps
  evergreens, shrubs, ferns, moss and dormant grass in winter, but filters out
  flowering herbs and floating aquatics. A snow-capped hollow tree no longer has
  a clover flower at its roots.
- **Desktop panels render in one paint again.** Progressive hydration is the
  narrow-screen path, as its own header says. It was also running on desktop and
  leaving only the first region card in the DOM for hundreds of milliseconds.
  Desktop keeps the synchronous panel; phones keep the 4 ms frame budget.
- **Measured cost on a large map.** Colossal 576 × 576 realm, seed `427919`, 36
  landmarks, one visible at rooftop and landscape distance. Before the cache the
  identity layer's landscape p95 was 22.27 ms against 16.77 ms with the layer
  disabled. After the cache both zooms and both arms sit at 16.67 ms average /
  16.8 ms p95 — the 60 Hz cap, with a p95 A/B difference of at most 0.07 ms.
- **Twelve-biome seasonal proof.** New
  `tests/browser/biome-identity-seasons.mjs` starts three real realms, captures
  all twelve biomes in autumn and winter at rooftop zoom and builds two contact
  sheets. The existing seasonal reference was also repaired for the second
  generation ledger and for the now-synchronous desktop panel. Both run with zero
  page or console errors.

## 3.48.0 — The biome identity becomes visible terrain

1.2.22 was already wired into generation, data and the panel. This release
finishes the part a player actually looks at: the ground, the seasons, the
landmarks and the atmosphere now read as different places instead of one green
sheet with a registry behind it.

- **Bilinear ground, not four-tile blocks.** `world.js#prerenderTerrain` blends
  the four surrounding cells of the coarse biome map. Each biome supplies its
  own land and water tint plus a deterministic grain amplitude, so pasture,
  leaf litter, peat, sand, scree and open water keep distinct surfaces at the
  closest camera. The bake is still one O(pixels) pass per realm and is cached.
- **Per-biome seasonal faces.** `terrain.js#seasonalTintOverlay` no longer paints
  one global seasonal wash. Every coarse cell takes the seasonal base and accent
  of its own biome, with altitude-aware frost and a soft low-resolution edge, so
  spring blossom, summer shade, autumn copper and winter frost meet in ecotones.
- **Landmarks, plants and bounded air.** New
  `presentation/rendering/biome-identity-render.js` places one deterministic
  landmark per discovered atlas region: drowned tower, salt spit, ice cairn,
  standing stone, frost mound, great spruce, sunken shrine, wind arch, kurgan,
  great oak, hollow tree and giant fig. Each anchor gets a small plant vignette
  and its biome's atmosphere motes, capped at 140 across the whole view. Anchors
  are cached by seed, discovery revision and map shape; only explored land is
  used, and water is avoided unless the region itself is coastal or aquatic.
- **The registry is readable in play.** The region card now prints all four
  seasonal colour swatches and the real plant palette (species, colour, form and
  variant count), in addition to the existing 54-point ledger.
- **Gates.** The focused world test now proves landmark determinism, the
  12-biome grain/atmosphere contract and a bounded 36-region selection; the
  browser atlas audit reads the swatches and plant chips from the live DOM and
  the visual reference renders the close, district and landscape cameras with
  zero page errors.

## 3.47.0 — Every biome now has its own generation and its own face

The whole 1.2.22 quality table is implemented as one central biome registry
plus one organic classifier, not as a new renderer or a second simulation.

- **Multi-parameter, organic generation.** `biome-generation.js` samples nine
  environmental fields — height, moisture, temperature, slope, water distance,
  elevation, light, soil and a regional climate bias — and picks a niche by
  Gaussian membership. Two scales of coherent warp move the borders with the
  real terrain contour; there is no per-tile random term, so a boundary cannot
  become a chequerboard. Beaches are a ribbon along the carved shore.
- **Measured, not asserted.** The field audit reports biome counts, connected
  patches, patch size spread, bounding-box fill (rectangularity), boundary
  complexity, chequer blocks, isolated cells and transition share. The panel
  prints the same numbers the world test asserts.
- **Plants belong to a place.** A central catalog assigns 52 species to the
  twelve biomes and to their own soil, moisture, light, elevation and season
  bands. Each species carries at least three variants, three age stages and
  several orientations; a low-frequency grove field opens clearings, and
  settlement, farming, mining and clearing thin the layer without changing
  species identity.
- **Central identity.** Every biome has a stable `biome.<key>` id, its own
  palette, vegetation silhouette, ground texture, atmosphere, water treatment,
  landmark, four seasonal faces and LOD contract. Nine fantastic families gain
  their own palette and landmark. Adding a biome is one data entry.
- **Visible in play.** Each discovered region card now carries a **BIOME
  GENERATION · 1.2.22** block and a collapsible **FULL GENERATION LEDGER · 54
  PARAMETERS** with one live value per point. The baked ground receives a quiet
  6% identity wash from a coarse biome map sampled every fourth tile, so the
  first glance at the map already distinguishes the formations without a
  per-frame classification.
- **Linked, not duplicated.** Resources derive their placement rules from the
  existing resource catalog, animal habitats link to the existing wildlife
  catalog, and hazard triggers name existing 1.2.20 mechanics and conditions.
- **Gates.** New `tests/world/biome-generation.test.js` covers all twelve
  biomes, four seasons, organic field metrics, vegetation distribution,
  resources, fauna, hazards, save/reload and a sampling budget; the browser
  atlas audit reads the 54 player-facing rows back. The shared height,
  moisture, temperature and river arrays are untouched, and the 25-year
  campaign remains deterministic and identical across two runs.

## 3.46.0 — Water, flood and frost now have consequences

The five 1.2.21 readouts that were still mostly descriptive are now consumed by
the existing farm and hazard paths. One derived seasonal pressure record feeds
the panel, the field harvest and the regional hazard bridge, so a shown value
and a real consequence cannot diverge.

- **Floodplain becomes a regional flood.** `floodplains` raises the region's
  displayed flood severity and supplies the pressure model's flood risk. The
  seasonal hazard bridge now prefers that pressure hazard instead of always
  taking the first generic danger, then calls the existing `triggerBiomeHazard`
  and `applyHazard` path. Floods damage only that region's standing fields and
  buildings; there is no parallel damage system.
- **Seasonal water and scarcity reach the granary.** `seasonal-water` and
  `water-scarcity` feed a bounded `yieldFactor` (0.80–1.06) inside
  `getCrossBiomeFarmYieldFactorAt`. The same factor is multiplied into the real
  `pendingHarvest`/`harvestTotal`, so a dry region harvests measurably less.
- **Snow/frost line cuts the standing crop.** Winter frost above 55% risk
  removes a proportional share of `field.growth` for sown and growing fields
  once per field and year, and applies the same frost pressure to the shown
  harvest multiplier. The player gets a `BIOME FROST` event with the region,
  risk and growth lost.
- **Water levels change both risks.** `water-levels` feeds flood and drought
  severity and the harvest pressure, so high water is not only a blue number.
- **Visible without a new screen.** The existing WORLD EFFECT line adds WATER,
  SCARCITY, FLOODPLAIN and FROST badges. The affected ledger rows show flood
  risk, harvest multiplier and field/building exposure, and harvest pressure
  adds one `BIOME HARVEST` note per region and year.
- **Compatibility and gates.** One optional field, `lastFrostYear`, is saved
  and old fields normalize to `0`; no schema bump and no new hazard rows. The seven
  coupling tests cover water-driven grain, frost-driven crop loss and a
  floodplain-selected flood; the browser reference reads the four new badges
  and the affected ledger rows back against the live profile. The 25-year
  campaign remains deterministic on the same seed.

## 3.45.0 — The 1.2.21 survey now moves, feeds and strikes the realm

The seasonal biome survey no longer ends at a readout. Its three player-facing
values now drive the systems a player already operates, inside the existing
bounded annual/seasonal cadence.

- **Movement is real.** The panel's route multiplier (0.80–1.06) is multiplied
  into `getRouteMovementFactorAt` for expeditions and into carrier speed in
  `updateLogisticsMovement`. The same caravan covers measurably more ground in
  an open region than in a wet, snowy or broken one. The multiplier is cached
  by year, season and saved region state, so the carrier loop stays a Map hit.
- **Farm suitability is real.** The survey's harvest multiplier (0.84–1.14) is
  applied by `ecotoneHarvestFactor` to the actual `pendingHarvest` and
  `harvestTotal` of every existing farm. Two identical farms in different
  regions now produce visibly different amounts, and the panel prints the same
  `harvest ×` value the field uses.
- **Seasonal dangers are real events.** A displayed regional flood, wildfire,
  frost, disease, erosion, drought or salinity value is bridged to the existing
  1.2.15 hazard catalogue and applied through `applyHazard`; field damage and
  structural destruction are filtered to that region. At most one regional
  danger matures per season (35% chance), only if it is currently possible and
  the region is discovered. The active hazard carries `source: "biome"`,
  `regionId` and `regionName`, and the region stores its `lastHazard`.
- **Saves stay compatible.** `lastHazard` is optional, validated and normalised;
  old realms load with `null`. No save-schema bump and no new hazard catalogue
  rows (the 102-row 1.2.20 contract is unchanged).
- **Panel and world agree.** The new WORLD EFFECT badges show route, harvest and
  the currently possible danger, plus the last regional event. The browser
  reference reads those badges back against the live profile, not just the DOM.

Verification: `npm test` (all files), the deterministic 25-year campaign twice
with identical output, and the seasonal biome Chromium reference with the new
coupling assertions.

## 3.44.1 — Seasonal biome layer survives real player review

A real Chromium review of the 1.2.21 map and panel found four presentation
problems and fixed them without changing the save shape or the annual economy.

- **The seasonal wash now reads at a glance.** The previous 8–13% tint was
  almost invisible against the terrain and region fill. The per-biome palette
  now has clearly separated spring green, summer straw, autumn rust and winter
  blue faces, drawn at 30–35% (winter 26–31%) over the region colour. Survey
  bars, resource markers, refuges, units, buildings and selection rings are
  still painted above it, so terrain and map symbols remain legible.
- **The map legend names the live season.** The BIOME ATLAS legend now includes
  a coloured `SPRING/SUMMER/AUTUMN/WINTER SEASONAL FACE` chip and refreshes
  when the season changes. Its note explains the paint order explicitly.
- **The panel keeps the player's place after an action.** Irrigating, draining,
  reforesting, cleaning water or burning a region no longer closes the region
  card and its 66-row ledger. The panel restores the open region, open ledger,
  scroll position and keyboard focus after the live re-render, so the new
  values appear where the player clicked.
- **The ecology ledger is readable at phone width.** Row text is slightly
  larger and higher contrast; long player-readout values wrap instead of being
  ellipsized. At 390 px the panel has no horizontal overflow, no clipped action
  labels and no nested scroll trap.

A new `test:biome-seasonal` Chromium reference captures four whole-map seasons,
coast/desert/forest close-ups, a selected city, an autumn/winter mountain realm
and desktop/phone panel states. It also asserts all 66 ledger rows, the live
legend, zero page/console errors, preserved panel state after an action, and
save/reload ecology continuity through the existing `test:biome-ui` reference.

## 3.44.0 — Cross-biome systems connect climate, soil, water, seasons, land use and recovery

1.2.21 adds a slow ecological memory to every one of the 36 existing biome
regions. It is not a second simulation: the 1.2.19 atlas still owns the region
graph, resources, wildlife and annual pass, and the new layer reads and writes
only the fields the rest of the game already uses.

- **66/66 points implemented and audited.** Eight climate zones and twelve
  climate envelopes give each biome its temperature and precipitation range;
  elevation, humidity, insolation and wind feed plant growth, soil life and
  erosion. Fourteen real soil types model nutrients, water capacity,
  compaction, humus, organisms, salinity and frost. Four local variants per
  biome plus four seasonal faces and four seasonal map tints per biome make
  regional deviation visible on the panel and on the biome map layer.
- **A real annual ecology step.** The existing year boundary now moves
  groundwater, pollution, water quality, nutrients, humus, soil life,
  compaction, salinity and legacy from rainfall, irrigation, drainage, farming,
  grazing, mining, settlement, roads, protection and restoration. Land-use
  footprints fade; legacy damage is deliberately sticky and some loss is not
  reversible within a reign.
- **Player actions use real gold, wood and time.** Irrigate, drain, reforest,
  clean water, burn-and-sow and restore habitat are wired through the existing
  management dispatcher. They write atlas history, change later annual passes,
  and slash-and-burn is limited once per year before any gold is spent.
- **Everything is readable in the BIOME tab.** The region card shows climate,
  soil, water, season, land-use and recovery sections, the ten explicit readouts
  (prevailing biome, variants, density, resources, animals, climate, hazards,
  farm suitability, movement, change) and a collapsible 66-row live ledger.
  The tab header summarises climate-zone, soil, variant, water-stress,
  irreversible-scar and regeneration counts.
- **No new per-frame work.** The panel is a pure reader over the snapshot. The
  ecological pass runs once per region per year and is bounded by the existing
  building, road, fauna and resource rows. There is no tile loop in render or
  tick.
- **Save-compatible by construction.** Each region persists a compact `systems`
  DTO; old 1.2.19 saves derive safe deterministic defaults from their own
  sample and seed. Invalid modern records are rejected, and save schema 13 is
  unchanged.

Verification: new focused 9-test suite, one full `npm test`, the deterministic
25-year campaign with no Game Over, the real BIOME browser reference (all 66
rows, all five new actions, save/reload equality, no console or page errors),
and both Pages deployments reporting the same `version.json`.

---

## 3.43.0 — Every active point is visible in the HAZARDS renderer

3.42.0 proved that each catalogue row moves state. The player-facing half was
still only a non-empty surface string, so this release makes visibility itself
executable.

- **State-bound HAZARDS rows.** Active events carry a `data-hazard-surface`
  spec and severity; bundles show their climate exposure; effects appear in
  `VISIBLE EFFECTS · LIVE` only while their modifier, mitigation or loss is
  non-zero; works, chronic processes and magic rows carry their live value.
  Every row is rendered by the real `renderHazardPanel()` used by the HAZARDS
  tab, not matched as source text.
- **Visibility neutralization.** `setHazardSurfaceProofHidden()` hides one
  surface without disabling the effect that produced it. The new browser proof
  runs the shared trigger cases, renders the panel into a real DOM, hides one
  row at a time and checks that the other rows remain. Result: **102/102 visible,
  102/102 neutralized, 0/102 survivors, 102/102 isolation checks**.
- **Honest active/passive split.** **102 active, 0 passive.** All 102 rows now
  have both a measured state delta and a rendered HAZARDS surface. No row is a
  flavour-only label; a future passive row must declare `passive: true` with a
  reason and is excluded from both proof counts.
- **No new simulation or save burden.** The rows read the existing snapshot and
  live modifiers. The hidden-surface set is test-only, empty in production and
  never saved; save schema 13 and deterministic rolls are unchanged.

Verification: focused hazard/terrain/save tests, the new browser visibility
proof, one full `npm test`, the deterministic 25-year campaign and the
hazard/terrain browser reference.

---

## 3.42.0 — The 102/102 claim is executed, not declared

3.41.0 added an evidence record per catalogue row, but that record could still
be satisfied by strings, panel markers and test titles. This release makes the
claim falsifiable: every row now runs through the real simulator and must move
measured state, and the same proof is re-run with exactly that row neutralized.

- **Executable state-delta suite.** `tests/world/hazard-effect-proofs.test.js`
  contains one proof for each catalogue row. Events use the real
  `applyHazard`/resource/health/field/herd/terrain path, bundles compare
  `getHazardProfile().exposure`, effects reach the derived modifier or event
  primitive, works raise their own mitigation field, chronic rows move the
  annual pass and magic rows move their saved burden, disease or rare chain.
- **Neutralization is a real run.** `js/systems/hazard-proof.js` is an empty
  production seam; the test fills one row at a time and requires the proof to
  collapse. Result: **102/102** proofs pass normally, **102** neutralization
  runs, **0/102** survivors (all 102 proofs fail as required).
- **Honest active/passive split.** **102 active, 0 passive.** No row is a
  flavour-only label; a future passive row must declare `passive: true` and a
  reason and is excluded from the count. Every active row keeps a non-empty
  HAZARDS/EVENT LOG surface in `hazard-evidence.js`.
- **No new simulation loop or save burden.** The seam is a module-level set
  lookup on existing hazard/season paths, never frame work. Save schema 13,
  deterministic rolls and old saves are unchanged; the proof roll override and
  neutralized set are test-only and never saved.

Verification: focused hazard/terrain/save tests, one full `npm test`, the
deterministic 25-year campaign and the hazard/terrain browser reference.

---

## 3.41.0 — Every 1.2.20 point has a proven chain

This release makes the 102/102 claim auditable instead of repeating it. The
catalogue still has 42 events, 9 regional bundles, 19 effects, 12 works,
9 chronic processes and 11 magic burdens; each row now has a single evidence
record in `js/world/hazard-evidence.js` naming the simulation consumer, the
player-facing HAZARDS/EVENT LOG surface, and the focused test. A new test fails
if any row has no effect branch, no shipped marker or no exact test title.

- **Former label-only paths now act.** Animal plague reaches the real
  `forestFauna` herds (bounded cull, declining trend, losses and history);
  `magic:rare` seeds a real rare chain through `selectRareChain()`; the odd
  poison-harvest primitive lowers work and raises disease risk; wells,
  irrigation, drainage, roads, warehouses, medical care and clothing now change
  their own loss/illness/outbreak/movement/caravan path instead of only the
  readiness score.
- **The player can see it.** The HAZARDS tab shows regional weights in percent,
  `HERDS` losses, `RARE PRESSURE`, and a `REALM RESILIENCE` block with disease
  pressure, injury resistance, medical care and adapted clothing. Each
  protection work names the risk it reduces.
- **No parallel system.** The existing bounded seasonal and annual passes do
the work; the herd cull is one pass over the capped herd list and the rare
chain uses the existing response layer. Save schema 13 and determinism are
unchanged; `losses.herds` normalises to zero for old saves.

Verification: focused hazard/terrain/save tests, one full `npm test`, the
deterministic 25-year campaign and the hazard/terrain browser reference.

---

## 3.40.0 — Hazards change the actual map

This release turns lava, wildfire and flood from ledger entries and coloured
scar marks into saved changes of the playable terrain. The map, movement,
resource nodes, roads, the seasonal forecast and every save now read the same
tile state. Save schema 13 is unchanged; a 3.39 save is migrated through the
existing restore path without inventing tiles or leaving a quarry standing on
fresh basalt.

- **Real terrain conversion.** Lava and lost ground are permanent, impassable
  basalt/rock. Wildfire converts a bounded area into burnt woodland with
  sharply reduced timber capacity. Floodwater converts ground for the year,
  raises its moisture and blocks movement while it is fresh. The existing
  bounded annual hazard pass performs the conversion; there is no per-frame or
  per-tick map scan.
- **Resource nodes are damaged, not just counted.** The shared resource
  geography now carries sparse `forestCapacity` and `stoneCapacity` deltas next
to the existing stock arrays. Lava and lost ground zero a node, fire removes
  standing timber and lowers future capacity, flood washes out stock and part
  of its capacity, and fertility/water access change with the tile. Regrowth
  cannot quietly restore a converted node.
- **Roads are cut where the hazard actually crosses them.** Flood and lava
  destroy the road tiles in their converted area; old 3.39 saves are migrated
  once so a saved flood mark no longer leaves a usable road on top of it.
- **The baked terrain canvas follows.** A clean tinted raster is retained and a
  dirty hazard layer is repainted only when scar marks change. The renderer
  draws the same saved marks over the map and the minimap, with a `Hazard terrain`
  legend that names burnt, flooded, lava, lost and corrupted ground.
  The hazard panel now reports converted tiles, lost nodes, cut roads, the last
  coordinates of each scar kind and the current fire/flood/lava conversion
  shield.
- **Protection changes the outcome.** Firebreaks, dams, drainage, avalanche
  barriers and safe siting feed a deterministic conversion shield. The annual
  event can still cost stores and fields, but a strong work can prevent a new
  tile mark entirely; weaker protection still reduces the converted area. The
  zero-firebreak baseline keeps the exact pre-3.40 readiness and hazard
  pressure.
- **Determinism and compatibility.** Scar areas use the existing seed/year
  hash, caps keep permanent marks, and a new save round-trips terrain, resource
  capacity, stock, blockades and roads exactly. Legacy 3.39 saves with marks
  but no capacity deltas run the migration path once; new saves with capacity
  snapshots skip re-damage on load.

Verification for this release: full `npm test` 1336/1336, a deterministic
25-year campaign (10,040 ticks, final year 26, `ok: true`), the terrain/season
browser reference and a live browser pass with all three terrain types visible
in the map legend and in the hazard panel. The only browser diagnostics were
the known AudioContext autoplay warnings.

## 3.39.0 — Climate drift, regional crises and real resettlement

This release closes the remaining "stored but not felt" gaps in 1.2.20. The
102-row catalogue was already complete; the depth work now reaches the world
queries, weather, morale, partner realms and actual population. Save schema 13
is unchanged, and a calm realm with zero drift still reads the exact shipped
baseline.

- **Climate drift is a real climate.** The saved `chronic.climateDrift` now
  shifts per-tile temperature and moisture queries, tilts the live weather
  table toward clear/dry or rain/snow, and raises heat/drought/fire pressure
  while lowering cold/frost/avalanche pressure. The world's `getBiomeAt`,
  forest, field and construction consumers therefore see the drift, not just
  the hazard panel. A small memoised reader keeps the per-tile path bounded.
- **Regional bundles have teeth.** The signature hazards named by a climate's
  regional bundle now carry its exposure multiplier. Volcanic, desert, swamp
  and mountain realms feel their own bundle's dangers more strongly instead of
  showing the same weights under a different label.
- **The morale modifier reaches morale.** `updateMorale()` consumes the saved
  hazard morale pressure, so a severe season leaves a persistent mood drag in
  the same simulation the player already watches; neutral weather is unchanged.
- **Refugees become residents.** Waiting `migrants` from neighbour aid and rare
  settlement decisions are now housed through the normal population gate: real
  `spawnEntity(VILLAGER)` arrivals, real household assignments, real yearly
  growth accounting. A realm without beds, food or morale keeps them waiting
  at the border instead of silently counting them.
- **Neighbour realms have their own crisis.** Partners now carry a bounded
  crisis (`outbreak`, `epizootic`, `drought`, `flood`, `fire`), refugee
  households and a trade penalty. Crises raise caravan terms, can send
  refugees, recover over time, and are cleared by aid. The hazard panel shows
  the crisis, waiting households and dearer trade; the existing aid button now
  answers any partner crisis, not only fever.
- **Verification:** focused 1.2.20, modifier and climate tests; full `npm test`
  (1331/1331), the deterministic 25-year campaign and a real cloud-browser
  check of the hazard panel. The local Playwright wrapper could not launch on
  this host because its Chromium system libraries are absent; the browser E2E
  workflow remains the CI gate. No gate was lowered.

## 3.38.1 — Browser E2E gate repaired and hazard losses booked

This is a focused verification release on top of 3.38.0. The live hazard
multipliers, save schema 13 and calm-realm behaviour are unchanged.

- **The twenty-seventh management tab is the hazard panel.** The browser E2E
  now expects the real deck of 27 tabs instead of the stale 26. It also opens
  the hazard panel, waits for its progressively mounted derived rows and checks
  that `MOVEMENT & EXPEDITIONS` and `CARAVAN SPEED` come from the same live
  movement reading. The tab is verified, not merely counted.
- **Hazard food losses reach the goods book.** Flood, water-shortage, lost
  workday and drought losses already reduced the royal food store but were not
  booked as consumed. The movement audit now reconciles after a hazard season
  instead of reporting a leak; the physical and expected food values differ by
  at most the existing 0.01 rounding.
- **No gate was loosened.** The E2E tab assertion is exact, the movement-panel
  relationship is checked, and the goods audit keeps its full 0.02 tolerance.
  The change does not alter hazard factors, production, consumption or saves.

## 3.38.0 — The hazard modifiers reach the last economic paths

3.37 turned the hazard layer into a living system. This release closes the
remaining places where a saved modifier was read by the panel but not by the
world, so the numbers in DERIVED CONSEQUENCES describe the running economy.
Save schema stays at 13 and calm weather stays byte-identical.

- **Real household water draw.** `needs` already raised food demand; it now
  also draws an extra load of water from the nearest real store at the bounded
  settlement cadence. The booking is keyed and idempotent, so a repeated pass
  or a reload cannot charge the same household twice. With no rolled hazard the
  function returns before touching logistics.
- **Caravan carriers slow down.** The `movement` factor now reaches the
  physical logistics carriers that haul goods between producers and stores,
  alongside villager travel and expedition departure. Pack animals and carts
  cushion half of the personal penalty, so the panel prints a separate
  CARAVAN SPEED value derived from the same movement reading. Clear weather
  leaves the old carrier timing unchanged.
- **Pasture lowers today's hunt as well as tomorrow's herd.** Stressed browse
  still lowers carrying capacity, and the same hunt now takes fewer animals.
  A successful hunt keeps at least one animal and a calm hunt keeps its exact
  old take.
- **Save/load coverage for every consumer.** A real hazard-state round-trip is
  tested against food demand, work, movement, extraction, pasture, caravan
  buy/sell and adaptation relief; the restored factors still drive the ledger,
  production and a live market trade.
- **Player-visible values stay honest.** The HAZARDS panel reads the same
  factors the settlement, construction, logistics, forest, market and
  expedition paths use. The food/water row now stands for an actual water sink,
  the movement row covers people and expeditions, and CARAVAN SPEED shows the
  cushioned haulage factor the carriers read.
- **Verification.** Full `npm test`, the focused hazard/settlement/logistics
  tests, the deterministic 25-year campaign with unchanged thresholds, the
  browser hazard reference and both production deploy gates are part of this
  release.

## 3.37.0 — The hazard layer becomes a living system

3.36 gave the 102 hazard points real economic multipliers. This release turns
the rest of the layer into decisions, places and consequences instead of panel
counters. The save schema stays at 13 and calm realms remain deterministic.

- **Forecast and four plans.** The scriptorium produces a bounded, seeded
  seasonal forecast with an uncertainty band; confidence comes from real
  research and protection. Once per season the player chooses stockpiling,
  evacuation, relief crews or fortification, each with a real cost and a real
  effect on the next hazard pass.
- **Buildable protection works.** Eight new city buildings join the PROTECTION
  menu: flood dam, avalanche barrier, drainage ditch, firebreak, weatherproof
  house, quarantine house, granary and warding stone. They use the normal
  placement, material, construction and save pipeline, and feed the protection
  survey that already lowered severity.
- **Spatial scars.** Wildfire burns real forest stock, flood scars cut roads and
  block crossings, lava and lost ground are permanent impassable tiles, and
  corruption spreads into neighbouring forage. The hazard map draws all of it.
- **A disease model.** Diseases now carry contagion, lethality, duration, a
  water/vector route and real case progression; treatment, quarantine and
  neighbouring outbreaks have costs and effects. Hazards still foul sanitation
  without declaring an outbreak themselves.
- **Neighbouring realms react.** Trade partners carry their own outbreak and
  animal-plague state, ask for aid, receive relief, and can send a fever back
  along the trade road. Relations and caravan terms move with those choices.
- **Rare events are chains.** Each rare event is a multi-year regional rule with
  an annual consequence and a player decision (cleanse, quarantine, treat,
  resettle, extend or accept the bargain) instead of a label and a counter.
- **Specialist crews and equipment.** Fire, rescue, medical and equipment crews
  are trained with real stores, raise protection and reduce casualties; they
  survive save and reload.
- **Rebuild economy.** Wreck recovery now sits beside an emergency fund, a
  three-year loan, resettlement of lost ground and permanent scars. Insurance
  pays toward destroyed structures and rebuilding on the wreck keeps the
  existing material discount.
- **Magic reaches the map.** Toxic fog limits sight, forbidden growth blocks
  gathering, corruption spreads across tiles, cursed animals become real
  creatures, and warding stones are buildable protection.
- **UI and save.** The HAZARDS panel exposes forecast, plans, crews, diseases,
  partners, scars, rebuild economics and the map overlay. All new fields are
  normalised under `environmentalHazards`; a 3.36 save loads neutral and gains
  the new layer without a schema bump.
- **Verification.** Full `npm test`, the 9 new hazard-expansion tests, the
existing 26 hazard tests, the browser hazard reference and the deterministic
25-year campaign are part of the release gate.

## 3.36.0 — Hazard modifiers now shape the realm

Hazard state was visible but inert: `getHazardModifiers()` produced needs, work,
movement, extraction, pasture, trade and adaptation values that no system read.
The 102-row catalogue, protection works and panel worked; the numbers behind
them did not reach a single household, build site, caravan or herd.

- **One dependency-light multiplier layer.** `js/systems/hazard-modifiers.js`
  turns the saved 0..1 modifier block into bounded multipliers. Every factor is
  exactly `1` with no rolled hazard, so calm-weather economy, expedition timing
  and save round-trips are bit-for-bit unchanged.
- **Household demand.** `calculateDailyLedger` accepts the hazard food-demand
  factor; extreme conditions raise demand and can turn adequate stores into a
  real shortage.
- **Production and building.** `getBuildingEfficiency` and construction progress
  are multiplied by the work factor, so staffed buildings produce less and the
  same builder takes longer on the same site.
- **Movement and expeditions.** Villager travel and flight speed slow, and an
  expedition's departure `travelDays` stretch, throttling real progress.
- **Extraction.** Lumber, quarry and gold-mine yields fall; the existing
  extraction budgets are unchanged.
- **Pasture.** Forest-fauna carrying capacity shrinks, so herds cannot grow past
  what the hazardous season feeds.
- **Caravans.** `executeTrade` applies the trade factors to what a purchase costs
  and what a sale pays, on top of the existing relation and price terms.
- **Adaptation.** Regional adaptation relief (`adaptation × 0.60`) takes back
  part of every penalty without erasing it.
- **Exposed work.** Environmental casualties are now drawn mostly from field,
  forest and mine crews rather than uniformly from the population, so a bad
  season can genuinely empty a lumber camp and trigger the fuel-backfill order.
- **Player-visible consequences.** The HAZARDS panel prints the concrete drag
  under each active hazard and a DERIVED CONSEQUENCES block reading the same
  multipliers the simulation uses; calm weather shows neutral `0%` values.
- **No save schema bump.** The modifier block already existed in schema 13; no
  new state was introduced. The regional bundle remains standing colour and does
  not enter the seasonal modifier average, so it cannot make calm seasons
  permanently modified. A legacy save with no rolled hazard loads with a neutral
  block even if an older build had left regional values in it.
- Tests prove calm factors are exactly neutral (ledger demand `3`, building
  efficiency `0.5`, construction `50`) while a hazard changes household demand,
  production, construction, extraction, pasture, caravan buy/sell and adaptation
  relief. The browser reference reads both calm and hazard panels and requires
  the displayed numbers to differ.

## 3.35.1 — Hazard treatment spends real medicine

The production check for 1.2.20 found the hazard panel reading
`health.herbalDoses` as if it were a medicine store. That field is the health
system's ledger of doses already given: it only grows, and a fresh realm starts
at zero, so TREAT CASUALTIES was permanently disabled in a real game and would
have decremented a historical counter if it ever fired.

- **Treatment now spends real medicine.** The hazard action draws from the
  brewed public store first and then from gathered herbs, lichen and the other
  medicinal goods in the forest ledger, through the same availability and
  consumption helpers the health panel uses. The dose ledger grows by the doses
  actually given instead of being spent as stock.
- **The panel shows the true stock.** TREAT CASUALTIES prints the doses a realm
  can actually hand out, and the button enables only when someone is sick and
  that store is not empty.
- Tests cover the store (spent), the gathered-goods fallback (spent in order)
  and the regression that a non-zero used-dose ledger alone cannot treat anyone.

## 3.35.0 — Living Hazards and Regional Disease

The world had biomes, weather and three separate hazard modules, but no shared
answer to what a climate actually does to the people living in it. Spec 1.2.20
asks for 102 connected dangers and countermeasures; the realm now has all of
them in one system instead of a fourth parallel module.

- **Every climate carries its own dangers.** Heat and drought in arid and
  savanna realms, frost and avalanche in snow, mountain and tundra realms,
  parasites and fever in rainforest and swamp, erosion and storm surge on the
  coast, ash, gas and lava in volcanic realms, corruption, fog and magical
  disease in the Enchanted realms. A new HAZARDS tab names the active dangers of
  the season, their severity and what they are costing.
- **Hazards act on the real realm.** Illness and injury land on real villagers,
  outbreaks go through the existing health model, food, wood, stone and gold
  leave the ledger, farm growth and fertility fall, roads and buildings can be
  lost (the keep and the wonder never are), morale drops and trade is disrupted.
- **Protection is built, not declared.** Wells, mills, walls, foresters,
  sanitation, roads, warehouses, clinics, healers, medicine, insulated homes,
  schools, barracks, the smithy and the keep each raise readiness; readiness
  lowers severity, injuries and destruction. Three actions are real and
  limited: prepare the season, treat casualties with stored doses and cleanse
  corrupted ground.
- **Paced like weather, not like a schedule.** Each danger rolls its own
  occurrence against its weight, so quiet seasons exist and at most three act
  at once. Seasons budget one casualty, one structure, six food and one morale
  point, and losses take the surplus above a 30-unit reserve rather than the
  seed grain. Hazard disease lowers the real sanitation score but stops at 46,
  so only accumulated neglect reaches the health system's outbreak threshold.
- **The crown and the noble houses are not hazard casualties.** They have
  shelter, stores and care; their people still fall ill, their dues and mood
  still suffer, but a bad season cannot erase a house. Civic anchors (keep,
  wonder, court, prison) are never destroyed, so a hazard cannot produce a save
  another system rejects.
- **Busy courts stay loadable.** While wiring the crime pressure, a latent
  justice bug surfaced: the fractional case roll could push the pending roll
  to `MAX_PENDING_CASES + 1`, and the loader rejects that save. The roll now
  fills only the remaining allowance.
- **Long-term processes.** Multi-year drought, plague spread along the trade
  partners of the live diplomacy state, animal plague across several places,
  wildfire zones and burnt ground, flood scars, lingering volcanic ash, a slow
  climate drift, disaster debt and permanently lost ground. In Enchanted realms
  corruption grows while untreated, curses the flora and fauna, brings toxic fog
  and arcane fever, shifts wildlife, and can be cleansed.
- **Bounded and deterministic.** The seasonal pass runs on a season change only
  (four times a year) and the long-term pass once at the year boundary, inside
  the existing annual slices. Every roll is a pure hash of seed, year, season
  and hazard id, so replays match and the shared random streams are untouched.
  The passes read caps and counters, never the tile grid, and nothing is added
  to the frame loop.
- **102 / 102 spec points.** `js/world/hazard-data.js` holds the catalogue, each
  row naming the mechanic that implements it; the test suite compares catalogue
  and engine so no requirement can be a label without a rule. Save schema 13
  stores the state; a schema-12 realm loads with a quiet hazard state.

## 3.34.2 — Phone Workshop

The workshop's “select a structure” step still assumed the map and the panel
could share a phone screen. At 390×844 the fixed bottom sheet began at y=346
while the map ended at y=728, leaving a 24px strip, so a phone player could not
select any structure and every editor action stayed out of reach.

- The unselected phone workshop is now a compact picker row. The whole map
  stays tappable; selecting a structure expands the full sheet, and SELECT ON
  MAP returns to the picker. Desktop and tablet keep the side panel unchanged.
- Unavailable actions now answer with the actual reason instead of a natively
  disabled button that silently swallowed the tap. An empty map tap reports
  that no structure is there.
- A browser regression drives the real touch path at 390×844 with a coarse
  pointer: it opens the workshop, taps a construction site, reads its details,
  checks the unavailable-action reason, cancels with the 35% refund toast, and
  restores the desktop viewport. A static UI test in `npm test` also guards the
  picker layout and reason copy.
- Verification: full `npm test`, browser E2E at full strength, and a
  cache-busted live check on all four deploy targets. This is a presentation
  change, so the deterministic campaign was not rerun.

## 3.34.1 — Touch Placement and Paused Inspection

A live player audit on the 3.34.0 production build found two surface defects
that only appeared when the viewport or pause state changed.

- A phone cannot show the Selected Card panel and the map together, so the
  documented drag gesture had no possible path. A narrow or coarse-pointer
  map tap now places the armed card, with a visible paused or rejected-tile
  reason; desktop map clicks keep drag-only placement. The Cards panel, help
  copy and card ARIA label now name both gestures.
- The workshop's “click a structure” step was swallowed by the pause gate,
  leaving pause-time inspection and cancellation unusable with no feedback.
  Map clicks now reach the workshop while paused; placement and combat remain
  blocked. A browser regression selects a structure through the real pointer
  path with the realm paused.
- `.save-status` is pointer-transparent so its thin overlay can no longer
  intercept map drags or panel clicks at 1400×900.
- Verification: full `npm test` at full strength, deterministic 25-year
  campaign, browser E2E including the new mobile tap and paused workshop paths,
  and a fresh-session production clickthrough covering cards, builds and
  staffing, trade, diplomacy gifts, court petitions, expedition departure,
  return, loot and lore, army recruitment and training, construction refunds,
  and save/load.

## 3.34.0 — Staffed City, Reachable Builds, Living Politics

A live systems audit found three classes of content that looked integrated but
had no functioning consumer, plus a long-run political ratchet.

- Civic service buildings can now actually be staffed. Town Halls employ
  clerks, Schools teachers, Bathhouses bathkeepers, Guildhalls guildmasters,
  Watchhouses watchmen and Breweries brewers, with matching profession labels,
  icons and skill families. Watchhouses are part of the real safety coverage,
  and courts, prisons and shrines are correctly treated as crown-maintained
  services rather than silently unstaffed buildings.
- Construction sites are validated against the physical settlement. A site
  with no walkable approach is rejected before materials are charged, and a
  site that cannot reach any store is rejected and fully refunded instead of
  consuming an opening share and waiting forever for planks. This closes the
  silent town-hall/school construction stall seen in long campaigns.
- Politics now has a bounded recovery path for every faction: paid upkeep and
  a debt-free court restore noble confidence, a fed and legitimate realm
  restores the clergy, and solvent wages restore the guilds. A long healthy
  peace no longer ratchets two factions permanently toward zero.
- The Explore panel no longer shows the developer-only SPEC AUDIT card above
  the player’s expedition content.
- The campaign driver can answer annual court petitions (enabled for the
  long-form release playtest), and after the 25-year gate it builds the civic
  service district so the new staffing and coverage paths are exercised.
- Verification: full `npm test` (1282/1282), syntax/import and local-asset
  checks. The deterministic 25-year gate is green at 0.835 ms/tick. The
  100-year playtest is green across 40,040 ticks at 1.323 ms/tick with 74
  residents, 55 buildings, zero active sites and factions 100 / 98.26 / 100 /
  100 (commons / nobility / guilds / clergy); no stalls, game over or food
  shortage.

## 3.33.0 — Grove Scatter and Canopy LOD

The 3.32 woodland still planted its crowns on a tile-shaped rhythm: one stand
sample per tile, copied or centred inside that tile. Zooming in made the lattice
obvious, and the district view broke the same wood into isolated dots.

- Close canopy LOD now samples a deterministic half-tile world lattice. Every
  tile has four candidate positions; each is independently skipped, jittered
  and sized from the stand, so a tile can show zero to four crowns (usually one
  to three) and no crown is anchored to the tile centre. Rooftop zoom samples
  82% of the candidate chance and interior zoom 90%, so neither level shows
  every stem.
- Clearings and damaged stands thin the whole scatter through
  `treeScatterChance`; the chance is bounded and never grows with zoom. The
  sampling is stable under panning, caching and reloads.
- District and landscape woods now collapse the same groves to wider,
  overlapping species-shaped canopy masses instead of a field of isolated
  dots. Conifer and broadleaf silhouettes still come from the stand's own
  species mix.
- Understory saplings are reserved for regenerating and cut-over stands;
  mature woods keep ferns, shrubs, berries, lichen and grass in the spaces
  between sampled crowns. The forest floor, understory and tree species remain
  tied to the stand, while meadow, wetland, desert, taiga and tropical profiles
  keep their own ground and trees.
- New player evidence: `tree-lod.png` shows one real wood at 0.09×, 0.30×,
  0.95× and 2.40×. The regenerated `player-view.png`, `player-view-hero.png`
  and `player-view.json` use the real 1.00× HUD camera and record the half-tile
  scatter, the four-zoom LOD tree counts and the three-tile pan rebuild.
- Local verification: full `npm test`, syntax/import checks, the focused LOD
  tests and the player reference with the production Canvas2D renderer. No
  simulation, save schema or economy value changed.

## 3.32.2 — Player-Zoom Woodland Proof

The 3.32.1 woodland was reviewed against a 2.4× inspection frame, not the
camera a player uses. At the real 1.00× view the crowns still read as small
stamps, the ink rim disappeared and the floor blended into grass. This release
fixes that view and commits the missing proof.

- The existing cached Canvas terrain pass now scales broadleaf crowns for
  gameplay distance, adds a dark under-print, strengthens the broken ink rim
  and internal hatching, and starts overlapping crown copies at 0.75× instead
  of reserving them for close inspection.
- Forest floor: a broad soil wash, stronger humus and a soft canopy shadow
  cover the baked meadow green between trees. Leaf litter is retained through
  winter, and snowy stands keep exposed brown leaf patches instead of becoming
  an undifferentiated snowfield.
- Bare winter crowns get a larger gameplay-distance branch envelope and a
  second order of twigs, so they read as trees rather than brown dots. The
  extra work is inside the cached detail layer; no simulation, save schema or
  economy value changes and no parallel renderer was added.
- New `npm run test:player-reference` starts a normal game with the real HUD,
  finds a wooded edge, and captures seed `20261104` at the 1.00× player camera
  plus 0.78× and 1.35× across all four seasons. It records a three-tile pan
  check and writes `docs/terrain-reference/player-view.png`,
  `player-view-hero.png` and `player-view.json`.
- The player evidence uses the dense edge at `112,48`: crown clusters and
  brown leaf litter on the left, real grass opening on the right. Set
  `PLAYER_VIEW_URL` to capture the same sheet from a deployed origin.
- Verified: full `npm test`, syntax/import checks, the regenerated Canvas2D
  terrain and forest references, the player-view run, and all four live
  targets serving version `3.32.2` at the release commit.

## 3.32.1 — Hand-Drawn Canvas Woodland Finish

The hand-drawn woodland now reads as ink on paper at the zoom where the player
actually sees it, and the committed reference sheets finally show the production
renderer instead of the optional WebGL ground.

- The Canvas2D crown pass keeps its deterministic silhouette, but now carries a
  stronger broken ink rim, internal pen hatching, darker under-washes and
  brighter leaf tips. Dense stands receive one extra overlapping crown copy at
  interior zoom, so the canopy closes instead of reading as isolated stamps.
- The forest floor keeps its bounded cached pass, with larger humus and moss
  washes, more leaf clusters, species leaves, twigs, moss pockets and a few
  short green blades. Tree bases get two low blades; no simulation, save or
  ecology value changes.
- `terrain-reference.mjs` and `forest-reference.mjs` now default to the
  production Canvas2D surface. `TERRAIN_REFERENCE_RENDERER=webgl` still produces
  the optional WebGL audit. The grove strip now selects a real inland ancient
  woodland rather than a meadow with scattered trees, so the hand-drawn canopy
  and floor are the actual production passes.
Verified: full `npm test`, the regenerated specification audit, and the
Canvas2D terrain and forest references.

## 3.32.0 — Treaty Standing

A twenty-year alliance now behaves like a twenty-year alliance.

- `realm.treatySinceYear` was written by every trade pact, alliance, war and
  peace deal, but no system read it. A treaty signed last spring and one kept
  for a generation produced the same aid, prices, trust and border risk, so a
  player could not build a durable peace.
- One bounded reading turns that saved year into a 0–20 year standing. It is a
  subtraction per realm, read by the existing annual court; there is no new
  per-frame or per-tick pass and no entity loop.
- Standing now changes four existing outcomes: a non-war treaty gains up to
  +0.6 trust at each annual court, buys and sells on terms up to 3 % better,
  and faces up to 4 points less border-incident pressure; an alliance's
  existing annual aid rises by up to +3 gold and +4 food.
- The diplomacy panel shows the treaty age in each realm's badge and a plain
  “TREATY STANDING · N YEARS · TIER” line with the exact trust, price and
  incident effects, plus an ENTENTE STANDING summary naming the oldest pact.
  The text says what the player controls: keeping the treaty in force deepens
  it, while declaring war resets that court's clock to zero.
- The year is already in the save schema. A legacy treaty without a recorded
  year reads as neutral zero and starts its clock at the next annual court, so
  old saves and fixtures normalize without a fabricated bonus.
- Browser proof: two identical alliances at the same relation, one sixteen
  years old and one a year old, gained 1.13 vs 0.68 trust in the same court,
  quoted 0.836/1.164 vs 0.859/1.142 buy/sell factors, and paid 5/7 vs 3/4 in
  aid; both readings were identical after save and reload, with zero page or
  console errors. The screenshots were inspected at 1440×960.
- Verified: 1,273/1,273 tests, syntax/import checks for 193 source files, the
  deterministic 25-year campaign, and the regenerated specification audit.

## 3.31.0 — Long-Task-Free Management Panels

Opening the population, nobility or diplomacy panel on the mature realm now
produces zero long tasks at the unchanged low-end gate.

- The 4× CPU-throttled, 70 % render-scale, speed-4 run over the 25-year realm
  passed with every phase at p95 16.8 ms and zero frames over 33 ms: the 40 s
  quiet window (which crossed a season), the dense window, and all three 8 s
  panel windows. The >33 ms and >50 ms percentage budgets were satisfied in
  every phase; no threshold, window, sample count, render scale or tolerance
  was changed.
- The open path no longer settles the fixed dialog and the full ledger in one
  click task. The shell is revealed first, the panel is rendered on the next
  frame, and its markup is hydrated in bounded rAF slices (three nodes/frame
  for nobility, two for population and diplomacy). Deferred slices reserve
  their space, so the visible layout does not jump.
- The population register pages ten citizens (five households) on desktop and
  three (two) on narrow screens. Search covers the full register, resets the
  page, and keeps focus and the caret through the re-render; paging still
  advances every record.
- The dialog's `aria-modal="true"` contract and the Tab focus trap keep the
  covered game unavailable to assistive technology without a whole-shell
  `inert`/`aria-hidden` style recalculation; the reusable dialog manager
  retains and tests the strict inert mode. Dialog focus lands after two frames,
  when the new panel has a settled layout.
- The browser audit builds its 25-year fixture in a short-lived child process
  before Chromium starts, so the mature campaign heap no longer inflates the
  test renderer. Long-task attribution and frame offsets are recorded with
  every sample. Browser-test memory-pressure isolation is used so synthetic
  host pressure cannot manufacture GC pauses; ordinary allocation GC and every
  app task remain inside the measured windows.
- Verified on the final code: 1,265/1,265 tests, syntax/import checks for 192
  source files, and the mature-realm player flow (open all panels, page the
  register, search, clear, close and reopen) with no page or console errors.

## 3.30.1 — Bounded Seasonal Rollover

A season change on the loaded 25-year realm no longer lands as one long task.

- The true spike was the first winter settlement pass: `updateSettlement`
  resolved a warehouse path for every household at once (31.5 ms alone), and
  the seasonal crown grain settlement added another block on the same tick.
  A normal day could also combine fields, forest fauna, building income and
  logistics into a 50.8 ms frame.
- Every presented daily tick now runs in bounded slices at the existing annual
  maintenance frame boundary: service coverage, household needs, winter/crown,
  population, land, economy and realm. The exact original call order is kept;
  empty slices collapse in the same frame so ordinary days keep their previous
  pace. Headless callers still execute one complete synchronous tick.
- The seasonal atlas revision and `kac:season-change` event still fire in the
  first frame, so the new season is visible immediately. No render path,
  terrain/forest reference, save field or deterministic random draw changed.
- The advanced performance gate now requires the loaded quiet phase to cross
  at least one season boundary and uses a 40 s window so the proof cannot pass
  without a rollover. The 4x CPU-throttled, 70 % scale, speed-4 run completed
  three consecutive times with zero long tasks and zero frames over 50 ms;
  the quiet phase crossed two seasons and the dense phase one.
- The deterministic 25-year campaign is unchanged: 10,040 ticks, year 26,
  74 residents, all requirements true. The complete suite passes 1,265/1,265,
  and the regenerated specification audit remains green.

## 3.30.0 — Hand-Drawn Forest Canopies

The Canvas close view now paints woodland as layered ink and wash instead of
flat “lollipop” trees.

- `rgbTriplet` now parses `rgb()` and `rgba()` and fails closed to black on
  invalid input. `mixHex` receives its own output repeatedly; the second mix
  used to produce `rgb(NaN,…)`, Canvas kept the previous `fillStyle`, and
  large pale or dark ghost crowns appeared across the wood.
- Broadleaf crowns use deterministic irregular silhouettes, layered washes,
  broken ink contours, leaf tips and visible fork limbs. Trunks taper, with
  bark ridges, exposed roots, hollows, broken limbs and separate light and
  shadow edges. Birches use slimmer, darker, curved boles with subtle
  fissures; conifers use drooping asymmetric tiers, needle clumps and broken
  lower rims instead of plain triangles.
- Winter snow on bare twigs is a thin broken ridge rather than round cotton
  caps. Marcescent crowns that still hold leaves carry the same thin snow
  ridges on their leaf masses, and canopies keep species-specific snow.
- The forest floor gains broad humus and moss washes, larger leaf drifts,
  recognisable species leaves, twig strokes and small moss cushions. Grass
  tufts were removed because they formed a lawn grid. Tree copies are
  deterministically jittered per tile so the plantation raster no longer
  dominates the close view.
- All of this is painted into the existing cached Canvas detail layer. No
  per-frame or per-tick work was added, and the deterministic simulation,
  save format and gameplay data are unchanged. The refreshed terrain and
  forest reference sheets document the result.
- The measured advanced profile on the loaded 25-year realm is frame p95
  16.7 / 16.7 ms, zero frames over 50 ms in either loaded-realm phase, zero
  long tasks, 665 ms save and 2,254 ms load. The 25-year campaign and the
  complete suite (1,265 tests) remain green.

## 3.29.0 — Advanced Realm Low-End Budget

A loaded 25-year realm now holds the documented low-end frame budget across
the year rollover, not just a fresh opening village.

- The browser reference now builds a real 25-year campaign save with the
existing campaign driver, injects it through the normal storage path and loads
it through the visible CONTINUE control. It verifies the restored year,
population, buildings and entities before sampling, and advances another year
so the sample includes the deterministic rollover.
- The loaded path runs the same economy, fauna, health, military, logistics and
villager path warm-up helpers as a new realm, plus the pure ecotone/field
harvest sampling path. A mature save no longer pays the one-time compilation
and cache-fill cost in its first playable ticks or on its first autumn harvest.
- Annual maintenance runs exactly one system per frame. A byte budget could
still stack a second system onto the first, cold-JIT annual call; the frame
boundary now prevents that. The first daily tick after the rollover is split
into season/settlement, population/citizen and daily-world frames, with a save
flush that keeps a complete tick. No simulation time, random draw or other
system runs between the slices.
- Building production and logistics stay on their existing cadence. The
presented craft calendar is offset away from the economy, production and
logistics ticks; headless campaigns retain the synchronous calendar. The
settlement calendar is unchanged.
- The event chronicle retention cap is 1,200 records. A 25-year save had grown
to 2,400 records and a 5.03 MB localStorage envelope, which exceeded the
browser origin quota and made the save disappear. The smaller bounded history
keeps older archives loadable and leaves headroom for the realm itself.
- The measured advanced profile is frame p95 16.8 / 16.8 ms, 0.84 / 0.50 % of
frames over 33 ms, zero long tasks, 551 ms save and 2177 ms load. The 25-year
campaign and the complete test suite remain green.

## 1.2.18 — Vegetation Density (development line)

The world now varies vegetation density inside a biome instead of treating each
habitat as one uniform surface. The complete `1.2.18.1–70` manifest is carried by
a deterministic local profile, not by a painted texture.

- `js/world/vegetation-density.js` combines three warped, world-anchored noise
  scales with the existing forest, grass, desert, wetland and land-use state. It
  yields five density bands, coherent groups, gaps, clearings, islands, age and
  disturbance structure, biome-specific habitats and bounded gameplay values.
- The terrain renderer applies the profile to the existing stand and sward
  objects: tree chance, canopy, clearing, understory, deadwood, tree height,
  grass height/density, bloom, shrub patches, colour and ground tint. Desert
  vegetation density and swamp reed counts read the same overlay. Camera LOD
  remains on the existing detail/tree lattices and is capped at three crowns per
  tile.
- All requested drivers are read from existing state: soil, water, light,
  competition, age, season, browsing, grazing, logging, fire, disease/pests and
  regeneration. No per-tile save array and no extra tick loop are added.
- Sight, movement, cover, concealment, hunting, wood/forage, fire risk,
  agricultural usability and animal habitat are exposed as one compact profile.
  Forest gathering applies its plant/food yield and hunting values while timber
  keeps its established stock contract; expedition routes apply its movement
  factor; field harvest applies its small agricultural factor. Resident errands
  keep their historical timing.
- Explore now contains a `1.2.18` survey with the active band, density, canopy,
  understory, light, habitat, driver/effect chips, a five-band nearest-sample
  strip and the complete 70-point manifest. PREV/NEXT on the ecotone survey also
  refreshes this density probe.
- A survey left open across a season boundary now refreshes once on that
  boundary instead of showing last season's band and season driver. The bounded
  refresh keeps the panel scroll position and an expanded 70-point manifest.
- Verification: focused density suite **9/9**, existing forest-gathering,
  pressure, insect, jungle and transition suites **38/38** together; full suite
  **1111/1111** plus syntax/import/UI checks over 174 source files. The 25-year
  campaign completed at **10,040 ticks / 0.754 ms per tick**; the 60-year
  endurance run completed at **24,040 ticks / 0.796 ms per tick** with save
  round-trips. The terrain browser reference rebuilt all **34 frames** (four
  seasons, four zoom levels, season transitions and the tree-year grove) on
  seed `20261104`.
- Full design and consumer map: [docs/VEGETATION_DENSITY.md](docs/VEGETATION_DENSITY.md).

## 1.2.17 — Transition Biomes (development line)

The world now has a real ecotone layer between its habitats. The requested
fifty-point transition manifest is implemented as fifteen named pairs, ten
landscape types and eight live pressures, not as a painted border.

- `js/world/transition-biomes.js` carries the complete `1.2.17.1–50` manifest,
  the 15 pairs (woodland–grassland through volcanic–mountain), three intermediate
  stage bands, warped widths, mixed flora, soil/tint mixes and a bounded survey.
- The baked terrain colour receives a packed, pure ecotone wash underneath the
  existing micro-relief. The detail renderer applies the same seam to the
  existing forest and grass profiles: tree density, grass height, shrub spread,
  clearing, understorey and a mineral soil wash. Sampling only happens on the
  detail/tree lattice that was already being drawn.
- Named landscapes: woodland steppe, humid grassland, dry open woodland, bush
  steppe, woodland tundra, mountain forest line, coastal forest, floodplain,
  savanna edge and bog–forest mosaic.
- Live changes read existing state: long-term climate drift, forest expansion,
  steppeification, wetland expansion, post-fire succession, logging regrowth,
  overgrazing and the rare-biome atlas edge, whose influence widens with realm
  age. No new per-tick world scan or save schema is added.
- The seam now reaches gameplay at existing decision boundaries. Farms and
  woodland/meadow gathering multiply their current yields by the tile's farm,
  forest or forage value; construction reads the farm-soil threshold and
  household suitability (only extreme bog/flood footing is refused); major and
  micro events weight families and places from the capital's ecotone; expedition
  travel days use the shared route-speed helper.
- The gameplay profile is derived only from `transitionAt()` plus existing
  forest/atlas/terrain state, so there is no new save field. Movement uses a
  bounded per-tile cache keyed by the inputs that can move the seam; harvest,
  placement, gathering and event lookups run only when those actions occur, not
  per frame. Resident errands keep their established timing so the long
  demographic balance remains stable.
- The Explore tab exposes the exact surveyed tile, a bounded PREV/NEXT seam
  cursor, stage, width, tree/grass/shrub percentages, active pressures,
  farm/forest/forage/settlement/movement chips, all fifteen edges and the
  fifty-point count. The scan runs once per panel/world/year; the cursor is
  transient UI state, not a save field.
- The terrain height/moisture/temperature goldens are unchanged. The preview
  pixel golden was updated only for the intentional ecotone wash.
- Verification: focused 1.2.17 suite **11/11**, full suite **1102/1102**,
  syntax/UI audit **173 files / 220 UI ids**, 25-year campaign **10,040 ticks at
  0.730 ms/tick** with all requirements and 74 residents, 60-year endurance
  **24,040 ticks at 0.823 ms/tick** with all requirements and exact save
  roundtrips. Full record:
  [docs/TRANSITION_BIOMES.md](docs/TRANSITION_BIOMES.md).

## 3.16.0 — Fantastic & Rare Biomes (development line)

The world now carries a rare-biome atlas built from the same seed and terrain
samples as the ordinary biomes. The requested 100-point fantastic-biome list is
implemented as nine playable families plus eleven atlas/integration points. This
is the player-facing **1.2.16** manifest; the earlier Winter Economy ledger keeps
its own 1.2.16.1–20 system identifiers in SNOWLANDS.md.

- Nine families — Enchanted Wood, Crystal Land, Fungal Wilds, Blighted Land,
  Glass Desert, Mist Moor, Ash Shadow, Hollow Depths and Magic Mountains — each
  with its own terrain tint, five to nine landmark anchors, rare good, boon and
  hazard.
- At most twelve seeded regions per world, with satellite islets and a
  one-byte tile lookup. Distribution also reads a deterministic remembered
  history (age, strife, magic, geology), so climate and old wounds shape which
  families appear. No second tile-object graph, no per-tick tile scan and no
  new O(n²) work.
- Discovery is checked every 200 ticks against explored ground. Discovered
  regions yield a rare good once per year; three units permanently attune a
  region and double its yield. Blighted regions spread pressure and must be
  cleansed before attunement.
- Annual hazards can now seed named public-health outbreaks (spore-lung,
  blight-fever, moor-ague, ash-lung and cave-fever) through the existing health
  system, instead of remaining only a morale or resource penalty.
- The atlas now feeds one cached influence profile into diplomacy, warfare,
  harvest/building efficiency, mature household growth, realm scarcity/unrest
  and royal administration. Charted cover and attrition operate through one O(1)
  tile lookup; the city growth bonus cannot bypass existing needs or food gates.
- Survey, rite and omen quests plus a real blight decree spend food, gold, wood
  or rare goods and change morale, legitimacy, politics or the chronicle. Six
  active quests, twelve archived quests and twelve history rows are the hard
  caps.
- A new Explore section exposes family progress, the rare-good ledger, real
  sales for gold, Attune and Cleanse controls and a bounded atlas journal.
- The tint is baked into the terrain surface at prerender; the landmark overlay
  is culled and drawn only over explored tiles in the WebGL, cached and canvas
  paths. At low zoom it degrades to a soft survey glow.
- The block is additive on schema 11. Old saves get a freshly generated atlas;
  saved discoveries, goods, attunement and blight pressure restore over it.
- Verification: focused atlas suite **12/12**, focused coupling suite **9/9**,
  full suite **1091/1091**, and the real 60-year / **24,040-tick** campaign at
  **1.076 ms/tick** with exact save/load and a legacy no-block load. Browser E2E,
  the resumable 60-year browser endurance gate and the production version check
  are recorded with the deployment. Full record:
  [docs/SPECIAL_BIOMES.md](docs/SPECIAL_BIOMES.md).

## 3.15.0 — The Endless Realm (development line)

The chronicle now has no terminal state. New realms start with **∞ ENDLESS
REALM** checked; the classic finite campaign remains available by unchecking it
at founding.

- A morale collapse restores morale to a survivable floor, costs legitimacy and
  starts a 400-tick rescue cooldown instead of freezing the realm.
- A keep reduced to zero health is held at 35% health; the raid still hurts, but
  the crown keeps a seat to rebuild from. The keep-destruction game-over path is
  preserved for classic realms.
- Every 25 years opens a new endless age, recorded in the chronicle and shown in
  the ambition HUD (`∞ ENDLESS · AGE N · NEXT YEAR`). The age is derived from
  the calendar, never trusted from a stale save.
- Existing saves without the block upgrade to endless; a save at `gameOver:true`
  is resumed as recoverable. State is additive in schema 11, bounded to 12
  history entries and does not change terrain or world options.
- Verification: **1071/1071 tests**; the **500-year / 200,040-tick** run on seed
  `20261215` reached **year 501, age 21, 56 residents, 13/13 ambitions, 16
  Eternal Deeds, 4 recovered morale collapses, 1.346 ms/tick and no game-over**,
  with all finite/resource/ID/entity invariants true. A 250-year gate also
  passes at 100,040 ticks. Full record:
  [docs/ENDLESS_REALM.md](docs/ENDLESS_REALM.md) and
  `artifacts/ENDLESS_500Y_AUDIT.md`.

## 1.2.16 — Winter Economy & Ice Roads (development line)

The completed 1.2.15 Snowlands ecology is now the platform for a second, deeply
linked winter layer. Twenty numbered systems (1.2.16.1–1.2.16.20) run on one
bounded twenty-day ledger plus one annual hazard/caravan pass. They consume real
firewood from warehouses, move market prices, fields, fertility, construction
speed, morale, illness, buildings, resident kits and neighbour relations.

- Snow depth now determines bearing capacity and transport speed; slow roads
  remove goods from the stores.
- Heating demand burns physical firewood. A shortfall raises illness risk,
  lowers morale and is priced into the wood market.
- Frozen water opens ice roads with real cart capacity; spring breakup destroys
  them and loses cargo.
- Clearance spends wood and labour; snow cover insulates soil, while frost and
  meltwater change field fertility; floods damage a building and then enrich
  fields.
- Wildlife migration adds hunt yield; wolf pressure and empty stores remove food
  and raise migration pressure.
- Avalanches/blizzards damage buildings and close passes; late caravans reduce
  relations. Festivals, winterised buildings and resident kits are real upgrades.
- The side panel exposes depth, demand, ice status, avalanche risk, meltwater,
  supply, event dispatch and six controls. State is save-compatible and bounded.
- Verification: focused 23/23 winter tests, full suite, 25-year Snowlands
  campaign, 20/20 audit at `artifacts/WINTER_1.2.16_AUDIT.md`, browser E2E and
  production check. No new per-tile loop or frame loop was added.

## Versioning policy

Kings & Cards uses a practical semantic version format:

- **MAJOR**: incompatible save schema, core simulation redesign, or a major game-generation milestone.
- **MINOR**: a player-visible feature phase such as roads, resource geography, logistics or dynastic systems.
- **PATCH**: compatible bug fixes, balance adjustments, UI fixes and save migration corrections.
- Development branches may use a `-dev` suffix. A branch name or draft PR is not a release.
- A version becomes **production-released** only after merge into `ulmweb-branch`, successful required CI, and confirmation that Cloudflare Pages serves that commit.
- GitHub Actions, Cloudflare Pages, and browser availability are separate release facts. One does not prove the others.

The version in `game/package.json` is the machine-readable game version. Update this file and this changelog together for every release.

## Separate hosted development builds

- **Deploy targets consolidated to the GitHub pipeline (2026-11-22):** the two Freebuff Sites origins for Kings & Cards (production `site-4652…`, preview `site-79c6…`, site `054512f6-1fcf-489c-8406-3ab4e49022e3`) were unpublished at the owner's request and now answer HTTP 404; their saved deployments and data remain in the site record. Before retiring them, the three published origins plus the GitHub Pages mirror were compared file by file: 371 of 372 runtime files matched by SHA-256 and only `version.json` differed, because that marker records each deployment's own source, branch and timestamp. Version `3.34.2` and commit `8001734a838351049ec70f586cf3b49eae8bca38` were live on all four. Production `https://kings-and-cards.pages.dev/` is the canonical main and `https://dulle1846.github.io/ulmweb/` the mirror; both are built and deployed from `ulmweb-branch` by GitHub Actions. See [docs/CLOUDFLARE_PAGES_RELEASE.md](docs/CLOUDFLARE_PAGES_RELEASE.md#retired-deploy-targets-freebuff-sites). No runtime code changed, so the version stays `3.34.2` and no campaign or browser E2E run was needed.
- **Kings & Cards — living noble houses (canonical Pages build):** production https://kings-and-cards.pages.dev/ · per-deployment Pages preview alias from the successful workflow · feature code commit `611964d2511779f5e9c1eb0505f52b8f7c0a5d0b`; the documentation-only release-record HEAD carries identical runtime files and is deployed through the same workflow. The package is 325 files / 7.77 MiB. Production and its preview serve the same `version.json` and 24 command tabs including NOBILITY. A live production run founded seed `20261114`, verified four houses, granted a charter, called a levy, collected 36 gold in annual dues, saved/reloaded and continued with the charter, muster, dues and defence intact; 0 page and 0 console errors. Full record: [docs/NOBILITY.md](docs/NOBILITY.md).
- **Kings & Cards — year rollover maintenance budget (previous Sites build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-14. Runtime commit `cd5ab916fac260a27273852e5c56d40cef405ee9` (324 files / 7.73 MiB). Preview receipt `fd4a63fe-d61e-43ff-a481-967f6c46be70` (20:50:50–20:50:53Z) and production receipt `21f635a2-33f2-4d52-954e-2a0ee5828837` (20:51:01–20:51:04Z) both succeeded; both environments are `published:true`. Both origins return HTTP 200, serve that commit in `version.json`, and match the runtime hashes `js/simulation/simulation.js` `70dcad6dd71b618b80815a6d3b66efcd750ef603e85ff0856cfc563da23f2962` and `js/app/game-loop.js` `5082d0fcaa7a8bffa3b9cf4d2349669e1607613046685a652b0f3c00f5987a0c`. A live production load founded seed `20261108` with 23 residents, forced the calendar to year 3 day 399, and completed the real rollover to year 4 day 9 / tick 1209 with **zero long tasks**, no page errors, no console errors and no failed requests. Full record: [docs/TAIGA.md](docs/TAIGA.md#low-end-performance).
- **Kings & Cards — taiga wilderness fog transition (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-14. Runtime commit `3496172cbe0a2a2b310e16fe897ba3d959f7ea03` (324 files / 7.73 MiB). Preview receipt `b624e4cc-c7af-4f8a-a89a-596c1ae0e4a9` (20:08:26–20:08:29Z) and production receipt `5fa93518-7eea-4785-a0e1-8edeefa42af4` (20:08:34–20:08:37Z) both succeeded; both environments are `published:true`. Both origins return HTTP 200, serve that commit and matching `terrain.js` SHA-256 `5d1a7d3b12d3bd41169dac5cb7d31940b75fcddd2d1bd520c2085e4d3d726dd3`. The new immediate wilderness fog jump measures **16.8 ms p95**, 0.56% over 33 ms, 0% over 50 ms, zero long tasks, 171 draw calls, 0 entities, 1.8 ms canvas draw and **59 fogged tiles**; the explored jump and all steady scenes remain green. A live production run of the same transition measured 150 frames at **16.8 ms p95**, zero long tasks, 171 draw calls, 1.9 ms canvas draw, 59 fogged tiles and `water.ice:true`, with zero page, console, network or HTTP errors. Full record: [docs/TAIGA.md](docs/TAIGA.md#low-end-performance).
- **Kings & Cards — taiga transition budget (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-14. Runtime commit `4bee9d1c5444d10555302cc397db915db24fb3c3` (324 files / 7.73 MiB). Preview receipt `4f5e41ad-dfa5-4269-84a7-f3ea56691220` and production receipt `c3fc3920-059a-442b-ba7d-d356b968f6c0` both succeeded; both environments are `published:true`. Both origins return HTTP 200, serve the same commit and matching `terrain.js` SHA-256 `80a62a916c703c5e8ccdc2078e0e5914790f9967f8f66d14b312dd0e17f158b0`. The new immediate camera/season jump phase measures **16.8 ms p95**, 2.75% over 33 ms, 0.55% over 50 ms, zero long tasks, 397 draw calls, 22 entities and 8.5 ms canvas draw after the rebuild fixes; the summer, winter-ice and settled-settlement scenes remain green. A live production jump had no page, console, request or HTTP errors and reached `water.ice:true`. Full record: [docs/TAIGA.md](docs/TAIGA.md#low-end-performance).
- **Kings & Cards — taiga campaign and low-end proof (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-14. The runtime package is 324 files / 7.73 MiB and its `version.json` identifies commit `67c6395bc5a7edab50ac2e131d4436eb39e3e506`. Preview receipt `3ecddb96-6286-49d4-8678-0753dc2e5d85` (18:17:17–18:17:19Z) and production receipt `71cac150-91e6-4141-bea6-f4d1e8da3d52` (18:17:22–18:17:24Z) both succeeded; both environments are `published:true`. Both origins return HTTP 200, serve that commit and the same `js/simulation/villagers.js` SHA-256 `01040c124ffd17aaef594e39044bb82f511a02cde49347c38c6f332d224331f1`. The 25-year Taiga sweep exits 0 with 3/3 seeds, eight real orders, max one per phase and a genuine sick-sawyer replacement at 47 firewood; the unchanged savanna sweep remains 3/3 with 29 orders. The low-end run is inside budget for summer (p95 16.7 ms / 164 draw calls), winter ice (16.7 ms / 174) and the populated settlement (16.8 ms / 412 / 20 entities), with zero long tasks. A live production load selected Taiga, founded a 176 × 176 realm, showed the frozen winter shoreline at day 340, and reported no page errors, console errors, failed requests or HTTP errors. Full record: [docs/TAIGA.md](docs/TAIGA.md).
- **Kings & Cards — Canvas-only renderer and warning-free benchmark (previous Pages build):** every user-reachable renderer path is Canvas 2D. The **Terrain renderer** selector and its WebGL option are removed; a saved `terrainRenderer` value is ignored on load. The **Device Benchmark** now measures only Canvas 2D at 100, 85, 70 and 50% (4 rows, progress max 4), so it cannot create a WebGL context. The **Adaptive quality** setting and its fallback loop were removed because Auto no longer uses WebGL. The runtime never calls `readPixels` and never requests WebGL or WebGPU on a user path. A no-GPU Chromium load created **0 WebGL contexts** and **0 page console messages**, with no software-WebGL or `ReadPixels` lines; the browser benchmark completed 4 Canvas rows, created **0 WebGL contexts** and emitted **no warnings**. Verified on this head: `npm test` **949/949**, syntax/imports **145 files / 201 UI ids**, 25-year campaign **10,040 ticks / 13/13 ambitions / 0.835 ms per tick / no stalls / no game over**, and the complete browser E2E green. Preview deploy receipt `a1943e40-d889-4c62-ae75-d2119120a56b` (17:09:29–17:09:33Z) and production receipt `eca17118-f67f-4936-bb52-9808c45cbb7c` (17:09:41–17:09:45Z) both succeeded; both environments report `published:true`. Both origins serve HTTP 200 and a `version.json` identifying commit `cdd07f8334f441238f0fd3e98de17fe726f964f3`; the runtime package is 322 files / 7.64 MiB. A live hardware-browser load confirmed `renderer:canvas`, no terrain-renderer or adaptive control, the four-row Canvas benchmark label, and 0 console messages. A local no-GPU Chromium load created 0 WebGL contexts and 0 console messages, and its Settings benchmark completed four Canvas rows with 0 WebGL contexts and no software-WebGL/`ReadPixels` warnings.

- **Kings & Cards — campaign sweep and eight-climate low-end proof (previous Pages build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-14. The runtime package is 322 files / 7.65 MiB and its runtime deployment's `version.json` identified commit `89ad0cac6118a9ecbfc7644441948c008ce4e627`; the later documentation build adds only this record and keeps the same runtime package. Preview deploy receipt `4dda27c7-f04f-41db-8349-90b4f2c82f70` (15:35:23–15:35:27Z) and production receipt `97ac77cd-16f2-433c-a9a8-3eb213214d32` (15:35:37–15:35:40Z) both succeeded; both environments report `published:true`. Both origins return HTTP 200 and serve matching SHA-256 hashes for `terrain.js` `3c375ab3c99b1387822abe8ad63b39319c4e0660a630b5df9e1b3c3c96f5c888`, `savanna-ecology.js` `7f675f510d46fe15265369bea555cfec99cc91c2d3d02e831dac328e39c56446`, `savanna-render.js` `8755b029b237ec64058c77e9f2e12b6bbab2612b07ba42cbec79b7e34134a0ec` and `terrain-model.js` `c8ba932d22c1a0532dd67cb8a20fa0706180dec77af3341c17bcf5de03b4a1dd`. A live production load and a live preview load each exposed all eight climate options (Temperate, Northern, Tundra, Savanna, Mediterranean, Arid, Enchanted, Tropical rainforest), returned HTTP 200 for every requested script and stylesheet, and reported no page or console errors; only the expected software-WebGL `ReadPixels` warning appeared. Verified on this head: focused savanna render 6/6, campaign aggregation 4/4, `npm test` 950/950, syntax/imports 145 files / 203 ids, complete browser E2E green, the three-seed savanna sweep exit 0 with 2 real fuel-backfill orders, and the eight-climate low-end proof exit 0 at p95 16.8 ms. Full record: [docs/SAVANNA.md](docs/SAVANNA.md).

- **Kings & Cards — tundra (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-14. Preview receipt `8c735389-98ad-4cb5-9032-0a06873b6686` (13:02:56–13:02:59Z) and production receipt `ca2f623c-bfe4-4898-8907-f96051c5a81d` (13:03:07–13:03:11Z) both succeeded; both environments remain `published:true`. The runtime package is 320 files / 7.57 MiB and its `version.json` identifies the deployed commit. Both origins return HTTP 200 and carry matching SHA-256 hashes for `tundra-ecology.js` `b35e169c39f55cf5d0acc9500300501941335398877ad23828e409798b606814`, `tundra-render.js` `ceec5f76b7b76882fcf98b111ad4a0cea4956501e4ff0d83b44750a8aaaa831f` and `terrain-model.js` `bb22b227f4fbf2a09123fe54f741657e1bb0ee3c86e3b1c442a0dbbea68dbd2e`. A live production load exposed the Tundra climate option, returned HTTP 200 for the document and every requested script and stylesheet, and reported no page or console errors; only the expected software-WebGL `ReadPixels` warning appeared. Verified on this head: focused tundra tests green; `npm test` 933/933; syntax/imports 143 files / 203 ids; complete browser E2E green; 25-year temperate campaign 10,040 ticks / 13/13 / 0.833 ms per tick / no stalls / no game over; 25-year tundra campaign 10,040 ticks / 13/13 / 0.553 ms per tick / no game over, with its firewood-stock flag still false (real fuel scarcity). Full record: [docs/TUNDRA.md](docs/TUNDRA.md).

These builds are published from the current development worktree to Freebuff Sites. They are **not** the Cloudflare Pages production branch and do not change the `3.10.0` Pages release status.

- **Kings & Cards — living population (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-10. Preview receipt `4d93041d-fc21-4ddf-8cd4-74ed48a242ca` (05:37:11–05:37:13Z) and production receipt `f1f68065-3d97-4ba1-af3b-a491f70e5c75` (05:38:43–05:38:45Z) both succeeded; both environments remain `published:true`. The runtime package is 131 files / 2.4 MB and serves the same `population-register.js` SHA-256 `5fbc0c3ffbcd011aa070120bf46cb0fcd5aabe6a4e1db120b46a48565822e9b4` and `population-panel.js` SHA-256 `f301219473797f0fdc4531eda95aff10215c2f239ade4c94a6e35de34bff4bba` on both origins. A Cloud-browser check founded Avalon / House Vere on both environments and opened the 18th PEOPLE tab: preview showed 22 citizens / 6 households / 22 civilians + 0 soldiers with Wren Goldleaf as the only royal; production showed 22 / 6 / 22 + 0 with Kael Longstride as the only royal. The SOLDIERS filter returned `0 matching · showing 0` with its empty state on both; production reported 0 console messages and no failed resources, preview only four software-WebGL `ReadPixels` warnings and no errors. The first preview check exposed that the sovereign's royal `KNIGHT` entity was counted as a soldier; the register now classifies royals as civilians and a regression test covers it. The performance pass then found the census entry point normalizing the whole register on every tick before its annual early return; it now checks the stored census year first, and same-year calls return the live register. Five post-fix campaigns measured 2.980–3.073 ms/tick (median 3.023, spread 0.093 ms), with the median below the 3.062 ms baseline and every run at 10,040 ticks / 13/13 / no game over. Verified on this head: focused population 8/8; `npm test` 683/683; syntax/UI 101 files / 189 ids. Full record: [docs/LIVING_POPULATION.md](docs/LIVING_POPULATION.md).

- **Kings & Cards — realm founding (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-10. Preview receipt `3047608e-096f-4c0c-b723-c7ec43047368` (04:56:06–04:56:09Z) and production receipt `0dd6ffcc-79b6-4369-92f2-716549ef2fb0` (04:56:11–04:56:15Z) both succeeded; both environments remain `published:true`. The runtime package is 129 files / 2.3 MB. A Cloud-browser check on the deployed preview rendered all new founding controls and the live summary, founded Avalon / House Vere with the harvest rite, guild custom, common law, consent doctrine, mercantile compact and mixed constitution, and opened the GOVERNMENT panel with the FOUNDING CHARTER block and chronicle; no console errors appeared, only software-WebGL `ReadPixels` warnings. The run exposed a duplicated “House House” chronicle prefix; it was fixed, the final build passed 675/675 tests, was rebuilt and redeployed to both environments, and production returned HTTP 200 with the fix confirmed. The 25-year campaign still reaches 10,040 ticks / 13/13 ambitions / 37.6 s / 3.062 ms per tick. Full record: [docs/REALM_FOUNDING.md](docs/REALM_FOUNDING.md).

- **Kings & Cards — faith, culture and justice (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-09. Preview receipt 94e3a656-e8af-415b-9a3a-2ff0931344cc (22:16:59–22:17:04Z) and production receipt c17585d4-9b5e-4a89-a3b9-8fcd7544db49 (22:17:06–22:17:11Z) both succeeded; both environments remain published:true. The runtime-only package is 126 files / 2.3 MB with no Markdown, maps, tests or JSON. Live Cloud-browser checks: both environments founded a year-1 realm with 21 residents, active faith and justice state, one shrine, one court and 16 tabs; the FAITH panel exposed 11 action controls and JUSTICE 7; production reported 0 console messages and all requests 200/304, preview only four software-WebGL ReadPixels warnings and no errors. Verified on this head: focused faith/justice 13/13; npm test 657/657; syntax and UI ids clean for 96 files / 185 ids; browser E2E green including shrine/court construction, clergy and judge appointments, a festival, a verdict and save/load; 25-year campaign 10,040 ticks / 13/13 / 4.545–4.546 ms per tick. Full record: [docs/FAITH_AND_JUSTICE.md](docs/FAITH_AND_JUSTICE.md).

- **Kings & Cards — named garrison and public health:** production `https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page` · preview `https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page` · site `054512f6-1fcf-489c-8406-3ab4e49022e3` · published 2026-11-09. Preview receipt `a3be04bf-8291-4fa3-bb8d-7d90dcedebbd` (21:31:20Z) and production receipt `5e312fca-97b9-441e-9ee1-b8b3b03b707b` (21:34:10Z) succeeded; both environments are `published:true`. HTTP checks returned 200 for the document, military, health, main module, stylesheet and an asset; deployed military/health SHA-256 hashes match the local files. Cloud-browser runs on both environments executed recruit, drill, sanitation, quarantine, healer and medicine actions with no page or console errors (only software-WebGL `ReadPixels` warnings). Production ended with 3 named soldiers, an active drill, sanitation 39, quarantine 1, a named healer, 7 doses and a balanced goods audit. Verified on this head: `npm test` 644/644, browser E2E green, 25-year campaign 10,040 ticks / 13/13 ambitions / 4.093 ms per tick (49.4 s). Full record: [docs/MILITARY_AND_PUBLIC_HEALTH.md](docs/MILITARY_AND_PUBLIC_HEALTH.md).

- **Kings & Cards — crown, court and living diplomacy:** production `https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page` · preview `https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page` · site `054512f6-1fcf-489c-8406-3ab4e49022e3` · published 2026-11-09. This was the previous hosted build. Deployment and publish receipts succeeded; production returned HTTP 200 and loaded in the Cloud browser without page errors. Verified on that head: `npm test` 636/636, browser E2E passed in 78.7 s, 25-year campaign 13/13 in 50.9 s.

## Production release history

### 3.20.0-dev — Snowlands (1.2.15.1–1.2.15.69)

**Released:** 2026-11-16 on the development line

**Scope:** a complete fourteenth climate, **Snowlands**, with seventeen named
formations: snowy forest, open snowfield, snow-covered grassland, alpine
snowfield, frozen plateau, frozen valley, wind-scoured snow, permanent snow,
snowy coast, frozen lake, frozen river, drift field, exposed ground, rocky
snow, frozen marsh, snowbound pass and powder basin. The deterministic
`snow-ecology.js` profile supplies snow cover, depth in metres, powder, packed
snow, ice crust, wet snow, drifts, mounds, exposed ground, tracks, snow loads,
surface water and ice, frozen springs, avalanches, pass closure, visibility,
wind, frost, hoarfrost, supply, frostbite and winter hardiness. Flora covers
snow-laden conifers, leafless deciduous trees, buried shrubs, winter grasses,
lichens and mosses; fauna covers ptarmigan, foxes, wolves, elk, reindeer,
subnivean rodents, migrants and hibernation.

**Integration:** **Snowlands** is selectable in world creation and has its own
height, moisture, temperature, season, weather and palette curves. One profile
feeds the baked terrain, detail renderer, survey, gathering, movement,
resource geography, economy and hazards. Snow woodland is a sparse but real
timber belt. Snow products reuse the shared goods and delivery ledger. The
annual snow hazard pass is bounded to 96 candidates, prefers occupied ground,
can destroy a real building or road, protects keeps and wonders, and applies
frostbite and blizzard supply loss through the existing health and resource
paths. Spring melt, muddy roads, swollen rivers, meltwater lakes and
north/south aspect retreat are the same fields the renderer draws.

**Verification:** `node scripts/snow-audit.mjs` generates a real 176×176
Snowlands world, surveys every tile through all four seasons and clear, snow,
storm and fog weather, gathers a snow product and drives the annual avalanche
pass against a placed house. The checked audit is **69/69 working**, all
seventeen formations observed, gathering successful and one real building
destroyed; see [`../artifacts/SNOW_1.2.15_AUDIT.md`](../artifacts/SNOW_1.2.15_AUDIT.md).
Focused ecological tests cover every requirement ID, all formations,
determinism, products, surfaces and the detail renderer. The full suite passes
**1040/1040** with syntax/import and UI-id checks clean for 165 source files.
The deterministic Snowlands campaign (`npm run test:campaign:snow`) reaches
10,040 ticks and year 26 with 70 residents, 70+ gold, 38 firewood, all 13
ambitions, an era objective and its material feedback, with no stalls and no
game over at 1.33 ms per tick. Documentation:
[docs/SNOWLANDS.md](docs/SNOWLANDS.md).

### 3.20.0-dev — Coastlands (1.2.14.1–1.2.14.71)

**Released:** 2026-11-16 on the development line

**Scope:** a complete thirteenth climate, **Coastlands**, with seventeen named
shore formations: sand beach, shingle beach, rocky shore, sea cliff, salt
marsh, dune field, lagoon, tidal flat, fjord, river delta, sheltered bay,
natural harbour, island shore, coastal forest, sandbank, reef and shallow
water. The deterministic `coast-ecology.js` profile supplies beach material,
dunes, cliffs, intertidal ground, lagoons, reefs, sandbanks, natural harbours,
tides, wave height, storm surge, erosion, flood, sand shift, salinisation,
spray, fog, ice, seasonal water and long-term coastline change. Flora covers
beach grasses, dune plants, coastal shrubs, salt-tolerant plants, coastal
forest, reeds, salt meadow, algae and seagrass; fauna covers gulls and terns,
seals and otters, waders, fish, crabs, mussels, sea turtles, coastal predators
and seasonal migrants. Fish, shellfish, salt, seaweed, driftwood, coastal
minerals, sea trade goods, pearls and amber enter the existing goods and
delivery ledger.

**Integration:** **Coastlands** is selectable in world creation and has its own
terrain palette, height/moisture/temperature curves, maritime season and rain
weights. One profile feeds the baked terrain, visual detail, survey, gathering
and works. Nine player works reuse the existing work UI and ledger: fishing
village, harbour town, trading post, coastal fortress, lighthouse, shipyard,
saltworks, coastal market and naval base. They spend real resources, respect
recovery cooldowns and are gated by the ecology the renderer shows. Strategic
control of a natural harbour is the same profile field consumed by the works.
The annual coastal hazard pass is bounded, runs only at the year boundary and
prefers occupied ground over empty water; it can destroy real buildings and
roads, while keeps and wonders stay protected. An optional `focus` supports a
deterministic surge, erosion, flood, sand or salinisation proof. An optional
bounded `coastWorks` save block is validated and restored; old saves without
it load unchanged.

**Verification:** `node scripts/coast-audit.mjs` generates a real 176×176
coastal world, surveys every tile through all four seasons, builds all nine
works, gathers a sea harvest and forces the real annual surge against a placed
house. The checked audit is **71/71 working**, nine works built, gather
successful and one real building destroyed; see
[`../artifacts/COAST_1.2.14_AUDIT.md`](../artifacts/COAST_1.2.14_AUDIT.md).
Focused coastal tests cover all requirement IDs, every formation, season and
tide changes, products, work persistence, malformed saves and the protected-core
hazard rule. The checked 25-year coastal campaign reaches **10,040 ticks /
72 residents / 3 agenda stages / 0.937 ms per tick** with stable firewood and no
game over. The full suite is **1033/1033**. The opening construction build-out
now leaves at least one fuel worker at a lumber camp or sawmill, so a new realm
cannot lose both woodcutters to foundations and stall its hearths for decades.
Documentation: [docs/COASTS.md](docs/COASTS.md).

### 3.20.0-dev — Volcano landscapes (1.2.13.1–1.2.13.73)

**Released:** 2026-11-15 on the development line

**Scope:** a complete twelfth climate with ten formations: single cone, large
crater, crater field, shield volcano, steep cone, caldera, fissure field,
volcanic chain, extinct weathered volcano and lava field. The deterministic
`volcano-ecology.js` profile supplies cone and crater relief, collapsed
calderas, open fissures, fresh, cooled and weathered lava, basalt, pumice,
obsidian, spires, ash, sulfur, mineral crusts, hot rock, fumaroles, steam,
hot springs, geysers, mud pools, soil age and regeneration stage. Flora moves
from lichen and moss through pioneer plants to grass, scrub and fertile soil;
fauna covers reptiles, birds, insects, crevice dwellers, mammals on old flows
and specialised hot-mineral species. Basalt, volcanic stone, obsidian, pumice,
sulfur, metal ore, minerals, geothermal energy, fertile volcanic soil and rare
crater materials enter the existing goods and delivery ledger. Hazards cover
eruptions, lava flows, ash rain, toxic gas, earthquakes, unstable ground,
rockfall and long-term uninhabitability. `volcano-hazards.js` now runs one
bounded annual pass over buildings, works, sampled roads and wild ground: an
eruption or earthquake marks a real building dead or removes a real road,
clears worker assignments, consumes food under ash and stone under tremor, and
writes the loss to the chronicle. Keeps and wonders stay protected and are
excluded from the destruction candidate scan; selecting a protected core had
consumed an annual event without damaging anything. The pass never enters the
frame loop. An optional `focus` lets a verification campaign exercise the real
eruption or earthquake branch without a roll, while the default still considers
both.

**Integration:** **Volcanic Lands** is selectable in world creation and has its
own palette, seasonal curve and hillshade. `volcano-render.js` draws bounded
cones, crater rims, calderas, fissures, cooled clinker, glowing cracks, steam,
hot water, yellow sulfur, pale mineral veins, cave mouths, new watercourses,
ash plumes, hot-rock cracks, flora, fauna and works without stamping every tile
with the same landmark; deep craters also draw on non-landmark tiles so an
active lava lake cannot disappear. Ten player works — lava, obsidian and pumice
quarries, sulfur and metal mines, mineral works, geothermal plant, fertile
terrace, crater expedition and observatory — spend real goods and persist in an
optional bounded `volcanoWorks` block in save schema 11. The sulfur work reads
the real `economy.sulfur` gate and delivers sulfur, and the construction path
rejects uninhabitable or too-young volcanic ground while allowing old usable
soil. The shared movement cache and combat path carry volcanic cost, gas and
rockfall damage and local defence. No extra tick loop, renderer, inventory or
save migration was added.

**Settlement recovery proof:** `scripts/volcano-campaign.mjs` runs a 9-year,
3,200-tick volcanic realm with the shipped simulation, construction, logistics,
population and event systems. The year-3 eruption destroys a real **Flour
Mill** and the year-4 earthquake destroys a real **Sawmill**; both are rebuilt
through `placeDirectBuilding()` on the same tiles and complete construction in
year 6. The run ends with 22 residents, 23 buildings, 582 food and no failures.
The audit carries the hazard log, destruction counts, coordinates, rebuilt
entity IDs and yearly recovery table.

**Verification:** all 73 requirements are declared once and reached by the
deterministic survey. `scripts/volcano-audit.mjs` generated a real 176×176
volcanic world (30,976 volcanic tiles), exercised work, gathering, hazard and
construction paths, and wrote a committed 73-row audit with a representative
tile, real profile values and observed downstream evidence for every item:
[artifacts/VOLCANO_1.2.13_AUDIT.md](../artifacts/VOLCANO_1.2.13_AUDIT.md).
Focused volcanic tests are **20/20** green and the full suite is
**1024/1024** green with syntax/imports **158 files / 201 UI ids**. The browser
reference `volcano-formations.mjs` captured all ten formations on seed
`20261212` with no page or console errors. The volcanic low-end run (4× CPU,
software Canvas, 70% scale, 55% forests, two years) held **16.7–16.8 ms p95**
in all five phases with **zero long tasks**, saved a 970,822-byte realm in
**176.5 ms** and loaded it in **1503.7 ms**. The deterministic 25-year campaign
completed **10,040 ticks**, **13/13 ambitions**, **0.805 ms per tick**, with no
stalled sites and no game over. The volcanic settlement campaign completed
**3,200 ticks**, destroyed **Flour Mill** by eruption and **Sawmill** by
earthquake, rebuilt both to **COMPLETED**, and ended with no failures. Full
record: [docs/VOLCANOES.md](docs/VOLCANOES.md).

### 3.16.4-dev — Year rollover stays inside the frame budget

**Released:** 2026-11-14

**Scope:** Remove the annual maintenance long task that the restored settled
wilderness fog scene exposed. This is a shared simulation fix, not a Taiga-only
render change: every climate and every low-end device crosses the same year
boundary.

**Profile:** the annual block measured **26.6 ms** in Node for the first
rollover and 11.4–14.0 ms afterwards. Under the browser's 4× CPU throttle the
same work was **40–55 ms**, and the settled fog phase recorded a **54–58 ms
simulation frame** and one long task: the annual block was running every yearly
system in a single tick.

**Fixes:**

- `ensurePersonProfile()` no longer reconstructs traits, needs, appearance,
  skills, memories and kinship on every lookup. A `WeakSet` marks already
  normalized profile objects; raw legacy/save profiles and freshly created
  profiles are still normalized once. The annual Node block fell to **13.8 ms**
  for the cold rollover and **3.7–5.0 ms** for steady years, with identical
  campaign outcomes.
- The presented game loop now runs the 17 annual systems as deterministic
  **6 ms slices** over a few frames. No daily system, tick or random draw runs
  between slices, so the resulting state is exactly the synchronous sequence.
  Headless tests and the deterministic campaign still execute the complete
  rollover in one `updateSimulation()` call. The simulation clock is not
  consumed during the slices, so no catch-up backlog is created. Saving during
  the window completes the year first; the save snapshot can never contain a
  half-applied rollover.

**Benchmark:** the settled `taiga-unexplored-fog` phase now runs through the
year-4 boundary instead of skipping it. It records **479 frames**, **16.7 ms
p95**, **0 % over 33 ms**, **0 % over 50 ms**, **0 long tasks**, **171 draw
calls p95 / 387 max**, **0 visible entities**, **1.4 ms canvas draw p95** and
**59 fogged tiles**. The quiet, dense, summer, winter-ice, populated-settlement,
explored-jump and immediate fog-jump phases all remain green in the same run;
`npm run test:performance:taiga` exits 0. A real save took **169 ms** and load
**1,183 ms**, with no page or console errors.

**Verification:** `npm test` **968/968** with syntax, relative imports and
201 referenced UI ids clean for 147 source files. The deterministic 25-year
campaign completes **10,040 ticks**, **13/13 ambitions**, every requirement
true, no stalls, no game over and **1.278 ms/tick**. Full record:
[docs/TAIGA.md](docs/TAIGA.md#low-end-performance).

**Deployed and live-verified:** runtime commit
`cd5ab916fac260a27273852e5c56d40cef405ee9` (324 files / 7.73 MiB). Preview
receipt `fd4a63fe-d61e-43ff-a481-967f6c46be70` (20:50:50–20:50:53Z) and
production receipt `21f635a2-33f2-4d52-954e-2a0ee5828837`
(20:51:01–20:51:04Z) both succeeded; both environments report
`published:true`. Both origins return HTTP 200, serve that commit in
`version.json`, and match the runtime hashes
`js/simulation/simulation.js`
`70dcad6dd71b618b80815a6d3b66efcd750ef603e85ff0856cfc563da23f2962` and
`js/app/game-loop.js`
`5082d0fcaa7a8bffa3b9cf4d2349669e1607613046685a652b0f3c00f5987a0c`. A live
production load founded seed `20261108` with 23 residents, forced the calendar
to year 3 day 399, and completed the real rollover to year 4 day 9 / tick 1209
with **zero long tasks**, no page errors, no console errors and no failed
requests.

### 3.19.0-dev — Mountains and highlands (1.2.12.1–1.2.12.77)

**Released:** 2026-11-15 on the development line

**Scope:** a complete mountain climate with ten formations: low foothills,
high chains, jagged peaks, rounded summits, sheer walls, ridges, deep valleys,
gorges, plateaus and isolated massifs. The deterministic
`mountain-ecology.js` profile supplies altitude, relative height, slope,
aspect, rock type and exposure, scree, cliffs, permanent snow and ice,
treelines that follow climate and aspect, springs, streams, waterfalls, tarns,
glaciers, meltwater and snowfields. Flora spans low montane and mixed forest,
subalpine conifers, krummholz, alpine grasses, mountain flowers, mosses,
lichens and rare high-altitude plants; fauna spans ibex, chamois, marmots,
eagles, vultures, foxes, wolves, lynx, ptarmigan and small rodents. Stone,
granite, limestone, slate, marble, iron and other ores, gemstones, salt,
mountain herbs, spring water, high timber, hunting goods and rare minerals
enter the existing economy. Hazards and movement costs cover steep slopes,
difficult traverses, limited passability, passes, height advantage, heavy
equipment, avalanches and supply burden.

**Integration:** a new selectable **Mountains & Highlands** climate with a
dedicated base palette, seasonal snow curve, `mountain-render.js` Canvas2D
layer for strata, scree, snow, ice, water, flora, fauna and works, mountain
timber and goods in `FOREST_GOODS`, the shared gathering ledger and delivery
channels, altitude/slope movement pricing with cached factors, height and pass
defence in combat, mountain survey summaries in the existing land-use path,
and short-goods telemetry through the shared systems. Schema 11 gains an
optional bounded `mountainWorks` block; no extra tick loop, no parallel
resource economy and no renderer above the existing detail budget.

**Mountain works:** all nine works are real player actions on a completed
building: **terraced village**, **sheltered valley settlement**, **summit
fortress**, **fortified pass**, **switchback road**, **gorge bridge**,
**mountain mine**, **stone quarry**, and **water conduit with a small dam**.
Each spends real wood/stone/gold, marks the tile in `state.mountainWorks`,
changes the ecology profile the renderer and survey read, repaints the tile and
delivers ore, stone, granite, limestone, slate, marble, gemstones, salt or
mountain water into the existing ledger. Extractive works have a per-tile
recovery cooldown and can trigger exposure through the existing public-health
path. Works panel, action delegation, save serialization, validation and
restore are wired into the same locations as the wetland works.

**Verification:** all 77 requirements are declared exactly once and all 77 are
reached by a four-season deterministic survey covering all ten formations; the
full suite is **1002/1002** green after the climate count and UI smoke checks
were updated. All nine works are buildable on the generated mountain map. The
live browser proof founded a mountain realm on seed `20261212`, selected an
**isolated massif** with 70 site features, surveyed
`Isolated massif · mountain slope · Stone, Granite blocks, Mountain spring
water, Firewood`, gathered real granite and mountain water into the ledger,
built a stone quarry for 4 wood / 2 stone and received 4 granite blocks. It
reported **60.5 FPS**, **0.6 ms p95** frame draw, and **0 page / 0 console / 0
request errors**. The mountain low-end run (4× CPU, software Canvas, 70% render
scale, 55% forest, two years) held **16.7–16.8 ms p95** in all five phases with
**zero long tasks**, 6.9–9.3 ms p95 canvas draw, 431–445 p95 draw calls, 203 ms
save, 1,433 ms load and **0 page / 0 console errors**.

**Relief pass and five-year mountain audit:** the flat highland screenshot is
replaced by hard-edged formation silhouettes, reduced colour and snow over the
baked hillshade, and a shared `drawMountainGround` path so rock, snow and forest
tiles keep their landform instead of falling into the generic snow branch. Each
of the ten formations has a distinct silhouette — a three-tooth high chain,
serrated jagged peaks, a vertical sheer wall, parallel ridge bands, a V-notch
deep valley, a narrow gorge slot, a flat mesa, rounded domes, low foothills and
an asymmetric isolated massif — with capped snow and a shaded lower snow line.
The highland bake uses a stronger key light and a lower permanent snow line; the
detail layer adds cast shadows and snowdrifts. A new
`tests/browser/mountain-formations.mjs` reference captures all ten formations
and a large renderer atlas. A five-year `runCampaign` audit builds terrace, road,
quarry, mine and aqueduct on one real mountain tile, observes every winter,
proves winter avalanche exposure rises above summer, and round-trips the works,
resources, tick and year through the production save pipeline. Full suite:
**1003/1003** green; live proof still **60 FPS / 0.6 ms p95** with no page,
console or request errors.

**Evidence audit and mountain depth pass:** the 77-point checklist is now
evidence-gated instead of pre-seeded per formation. A cave flag appears only on
a tile whose `cave` landform is true, a glacier only where permanent ice is
present, an ibex only where the fauna list contains one, and works 69–77 only
when the player-built `use` flags exist. The four-season survey still reaches
every natural requirement and the rendered built profile reaches all nine
works, while a wild tile can no longer claim a fortress it does not have. The
renderer adds granite speckles, limestone bedding, slate cleavage, marble veins,
boulder fields, crevices, cave mouths and overhangs; species-shaped alpine
flowers with rare-plant halos, lichen patches, spring eyes, ice caves, frozen
falls, snowfield edges and distinct goat, marmot, raptor, predator and rodent
silhouettes. Combat now reads the same cached mountain movement factor as the
economy, applies avalanche and supply attrition to raiders, and gives local
levies and veterans a bounded mountain-experience attack bonus. The suite is
**1004/1004** green; the low-end mountain run holds **16.7–16.8 ms p95** with
**zero long tasks**, 220 ms save and 1,512 ms load; the live proof reports
**59.9 FPS**, **0.5 ms p95 draw** and zero page, console or request errors.

### 3.18.0-dev — Swamps and bogs (1.2.11.1–1.2.11.81)

**Released:** 2026-11-15 on the development line

**Scope:** a complete wetland climate with ten formations: shallow- and
deep-water swamp, reed swamp, alder carr, fen, raised bog, peat bog, flooded
floodplain, seasonal wetland and coastal mangrove. The deterministic
`swamp-ecology.js` profile supplies water depth and turbidity, peat and unstable
ground, reeds, sedges, mosses, water lilies, carnivorous plants, alder and
willow carr, frogs through otters and fish, seasonal berries, medicinal herbs,
peat, clay and rare bog plants. Hazards include sinking mud, hidden depth,
insect-borne fever, contaminated water, fog, high movement cost and wagon risk;
the same profile carries boardwalks, bridges, drainage, peat cutting, fishing,
reed craft and natural defences.

**Integration:** a new selectable **Swamps & Bogs** climate with its own
seasonal snow curve and palette, a `swamp-render.js` Canvas2D layer for water,
reeds, moss, mist, reflections, bubbles, insect clouds and fauna, carr timber in
the shared forest model, swamp goods in `FOREST_GOODS` and delivery channels,
and wetland survey summaries in the existing land-use path. Schema 11 gains an
optional bounded `swampWorks` block and no extra tick loop.

**Wetland works and active hazards:** the profile was already complete, but the
works it described were passive booleans. They are now real player actions on a
wetland farm or stable: **timber boardwalk**, **drainage cut**, **stilt
platform**, **small bridge and dam**, **peat cutting**, **wetland fishing**,
**managed reed harvest**, a **reed screen and dyke** for natural defence, and a
**wetland access survey** that lowers the development penalty. Each spends real
wood/stone/gold, marks the tile in
`state.swampWorks`, changes the ecology profile (lower water and bearing for
drainage, better movement for boardwalk/bridge, lower reed/peat abundance after
cutting), repaints the tile, and delivers peat, marsh fish, waterfowl, reed and
reed matting into the existing gathering ledger. Extractive work has a
per-tile recovery cooldown and can trigger marsh fever through the existing
public-health exposure path. The wetland renderer now draws planks, ditches,
peat faces, fish traps, reed stubble, bridges, defended reed screens, survey
markers and stilt floors, and uses the profile's open/closed light mood for the
canopy/shore contrast.

**Verification:** all 81 requirements are declared and reached by a two-season
deterministic survey covering all ten formations; the full suite is
**989/989** green after its hardcoded climate and formation counts were
updated. A local-storage save that no longer fits both the primary slot and
its recovery copy now evicts only the backup and retries the authoritative
save, so a large late-game realm cannot fail at the save button. The cold-start comparison on the shipped low-end profile (4x CPU,
software Canvas, 70% render scale, 85% forest, two years, no warm-up) measured
swamp **16.8 ms p95** against savanna **16.8 ms**, with **zero long tasks** in
both scenarios.

- **50-year browser endurance:** the resumable audit completed all ten
  five-year blocks, year 26 → 76, **19,942 ticks**, **11 samples**, every
  checkpoint exact, and the schema-8 legacy round-trip back to schema 11 exact.
  It recorded **0 page errors / 0 console errors** and **30 FPS** at the shipped
  low-end profile. `test:endurance` is now a job in the browser workflow; the
  audit also fixes its real ordering bug by selecting 4× before validating the
  loaded start sample.
- **Live swamp gameplay:** a fresh browser realm in the **Swamps & Bogs**
  climate found a fen with standing deep water, reeds and carr. The live survey
  returned `Fen meadow · deep black water · Peat, Reeds, Marsh fish, Swamp mud
  and clay` plus marsh frog, toad and bog adder; player gathering added **Peat,
  Reeds, Marsh fish, Reed matting and Swamp mud and clay** to the real ledger.
  The proof recorded 0 page/console/request errors and 60 FPS, with 0.68 ms
  average / 0.9 ms p95 frame draw time.
- **Low-end swamp audit:** at 4× CPU throttle, software Canvas2D, 70% render
  scale and 85% forest cover, all five phases held **16.8 ms p95** frame time,
  **0 long tasks** after the cold-cache warm-up, 7.9 ms / 7.0 ms p95 draw time,
  176 ms save and 1,253 ms load, with 0 page and console errors. The dedicated
  `test:performance:swamp` and `test:swamp-live` commands are part of the
  browser workflow.

### 3.17.2-dev — 50-year endurance audit stays synchronized

**Released:** 2026-11-15 on the development line

**Scope:** make the long-running browser audit measure the real game after a
mature realm is loaded. No runtime behaviour or balance values changed; every
edit is in `tests/browser/endurance-50y.mjs`, plus a `test:endurance` script.

- The HUD intentionally paints `SIM TICK` at most once per second. The audit
  now allows a 12-tick display lag instead of treating a deliberate DOM budget
  as a simulation mismatch.
- DOM resources and panel values are read only after the bounded HUD chunks
  have landed, with the simulation paused for that same task. Panel checks pause
  while the panel is measured and then resume the previous run state. Raw
  resource numbers are kept for the exact floor comparison instead of comparing
  a two-decimal display value.
- The frame-rate sample now runs in a fresh real-time context after the fake
  clock is removed, loads the saved realm through the visible continue control,
  and brings that page to the front before sampling. A separate mature-load
  check rendered a **75-year realm** at **129 frames in 4.0 s (30 FPS)** with
  zero page errors and zero console errors.
- Recorded 50-year run: **year 76 / tick 30,091**, **12 samples**, 74
  population, 132 entities, stable resources, morale 99.7 and legitimacy 100,
  with exact save/load and zero page or console errors. Its last FPS assertion
  was invalidated by the headless page losing foreground focus; the sampler now
  brings the fresh page to the front before sampling.
- Final 5-year harness run after that fix: **29.94 FPS** over 90 frames, exact
  schema-11 save/load (2.30 MB, 728 ms), zero page errors and zero console
  errors. Full suite **977/977**.

### 3.17.1-dev — Noble-house regression guard

**Released:** 2026-11-14 on the development line

**Scope:** keep the noble-house balance from silently regressing. No runtime
behaviour or balance values changed; the new guard makes the existing health
contract executable in `npm test`.

- Added `tests/systems/nobility-balance.test.js` and its isolated campaign probe.
  Eight fixed seeds each run a real 25-year campaign in a **fresh child
  process**, so module state cannot leak from one seed into the next.
- Every annual audit is checked for all four houses: no missing audit, no
  dormant year, no zero-member final state, no loyalty below the game's real
  30-point withholding threshold, and no withheld dues.
- The gate also rejects a synthetic house with permanent dormancy, a single
  withholding audit, or a missing audit, proving the test fails on the failure
  class rather than only on today's measured values. It does not assert the
  56–63 loyalty band.
- Recorded result: all eight seeds keep **4/4 houses**, **0 dormant**, **0
  withheld audits**, minimum loyalty **56**, over all 25 annual audits. Full
  suite **977/977** with syntax/import checks.

### 3.17.0-dev — Living noble houses

**Released:** 2026-11-14 on the development line

**Scope:** add the missing resident-led nobility layer. Four houses are founded
from the realm's real family names; each has a named head, estate, wealth,
loyalty, power, levy and annual dues. Houses are not a parallel population:
births, deaths, court offices and family names continue to drive membership.

**Player system:**

- The new **NOBILITY** command panel lists each house, its head, members, wealth,
  power, levy, loyalty, dues and latest chronicle record.
- **Grant charter** costs 30 gold and 10 wood, permanently raises the house's
  wealth, loyalty, levy and power, and applies a real political effect.
- **Call the levy** requires 35 loyalty, lowers loyalty by 7, musters the house
  for two years and raises the realm's combat defence.
- The annual audit collects real gold dues, withholds them from houses below 30
  loyalty, applies faction and legitimacy pressure, and records the result.
- Dead heads pass to the oldest living adult; empty houses become dormant rather
  than inventing a new family.

**Integration:** economy (`addResource` dues and charter costs), politics
(`applyPoliticalEffects` from loyalty and withholding), combat
(`getNobilityDefenseMultiplier()`), court (member office standing) and
dynasty/population (real heads and family-name membership).

**Save:** additive `state.nobility`; normalized after court on restore, bounded
to four active houses, 48 members and 24 chronicle entries. Save schema stays
11 because no existing field changed.

**Verification:** focused tests **7/7**; `npm test` **975/975** with syntax and
relative-import checks; 25-year campaign **10,040 ticks**, **13/13 ambitions**,
all requirements true, no stalls, no game over, **0.797 ms/tick**. The 4×
CPU-throttled Taiga run adds a `nobility-panel-open` phase: **475 frames**,
**16.8 ms p95**, **0.421% over 33 ms**, **0% over 50 ms**, **0 long tasks**;
save **184 ms**, load **1,372 ms**, no page or console errors. The real-browser
`npm run test:nobility-ui` run founded seed `20261114`, granted a charter,
mustered a levy, ran the annual audit, saved, reloaded and verified persistence
with **0 page / 0 console errors**. The existing full browser E2E also passes
with the 24-tab command deck and no page errors. Full record:
[docs/NOBILITY.md](docs/NOBILITY.md).

**Deployed and live-verified:** canonical Pages production
https://kings-and-cards.pages.dev/ and the per-deployment Pages preview alias
from the successful workflow serve the same runtime files (325 files / 7.77
MiB). The feature code is commit `611964d2511779f5e9c1eb0505f52b8f7c0a5d0b`;
the documentation-only release-record HEAD carries identical runtime files and
is the deployed build. The initial feature deployment was GitHub Actions run
`43642748905`; the final release-record deployment uses the same workflow and
production version-marker check. Both origins return the deployed HEAD in
`version.json` and expose the 24-tab command deck with the NOBILITY tab. A live
production Playwright run founded seed `20261114`, verified four resident-led
houses, granted House Longstride's charter, called its levy, ran the annual audit
(**36 gold** dues, defence **1.1463**), saved, reloaded and continued with the
charter, muster, dues and defence intact, with **0 page errors / 0 console
errors**.

### 3.16.3-dev — Taiga wilderness fog transition

**Released:** 2026-11-14

**Scope:** Test the immediate camera/season jump into unexplored terrain, prove
the active fog path is actually drawn, and keep the transition inside the
existing frame, long-task, draw-call, entity and canvas budgets.

**Benchmark:** `tests/browser/low-end-performance.mjs` now finds an unexplored
non-water Taiga tile far from the lake and settlement, reveals only a radius-4
island, and samples `taiga-unexplored-transition` immediately after the jump.
`applyTaigaScene()` counts visible fogged tiles and the budget gate fails the
phase if `fogTiles` is zero, so the fully-explored fog shortcut cannot pass by
skipping the fog path.

**Profile and fixes:** the jump no longer invalidates the fog mask on a camera
or season change; only an actual exploration change does. The transient gap
underlay and detail-base pass use low-quality upscaling while the staged layer
is rebuilding, while the settled layer keeps full-quality fog. The phase
sampler resets at a clean `requestAnimationFrame` boundary, so a frame already
in flight is not charged to the next phase.

**Measured wilderness fog transition:** 179 frames, **16.8 ms p95**, **0.56%**
over 33 ms, **0%** over 50 ms, **0 long tasks**, **171 draw calls p95 / 371
max**, **0 visible entities**, **1.8 ms canvas draw p95** and **59 fogged
tiles**. The explored camera/season jump is **16.7 ms p95** with 0 long tasks;
the summer (16.7 ms / 164 draws / 1.6 ms), winter-ice (16.7 / 174 / 1.8) and
settled settlement (16.8 / 392 / 6.8) scenes remain green. Full
`npm run test:performance:taiga` exits 0 with no budget relaxed and no scene
removed. Full record: [docs/TAIGA.md](docs/TAIGA.md#low-end-performance).


**Deployed and live-verified:** runtime commit
`3496172cbe0a2a2b310e16fe897ba3d959f7ea03`, preview receipt
`b624e4cc-c7af-4f8a-a89a-596c1ae0e4a9`, production receipt
`5fa93518-7eea-4785-a0e1-8edeefa42af4`; both environments are
`published:true` and serve the same `terrain.js` hash. The production fog
transition completed 150 frames with zero long tasks, 59 fogged tiles and no
page, console, network or HTTP errors.

### 3.16.2-dev — Taiga camera-jump transition

**Released:** 2026-11-14

**Scope:** Profile the one-time terrain-detail rebuild after a camera or season
jump, make it fit the existing frame budget, and add the jump itself to the
Taiga benchmark instead of waiting past it.

**Profile and fixes:** the new transition phase starts sampling immediately
after the camera and season change. Its first measured run was **66.7 ms p95**,
with **100%** of frames over 33 ms and **60.7%** over 50 ms. The fallback was
re-sampling the whole-world fog texture and baked ground every frame, an
off-screen old detail layer was still being composited, and the first underlay
raster could exceed a long-task budget. `js/presentation/rendering/terrain.js`
now:

- crops the fog source to the visible tiles instead of the whole realm;
- skips the fog draw when every visible tile is explored (the texture is
  transparent there);
- hides the old detail layer when less than 45% of it remains on screen after a
  jump; and
- caches the static ground/fog underlay while the staged detail rebuild runs,
  then blits it instead of re-rasterising every frame.

**Measured transition:** 182 frames, **16.8 ms p95**, 2.75% over 33 ms, 0.55%
over 50 ms, **0 long tasks**, **397 draw calls p95 / 467 max**, **22 visible
entities p95**, **8.5 ms canvas draw p95**. The existing summer (16.7 ms / 164
draws / 1.5 ms canvas), winter-ice (16.7 ms / 174 / 1.8 ms) and settled
settlement (16.8 ms / 433 / 7.0 ms) scenes remain green under the same budgets;
no budget was relaxed and no scene was removed. Full benchmark exits 0 with
`npm run test:performance:taiga`.

**Verification:** full `npm test` **966/966**; syntax and relative imports clean
for **147 source files / 201 UI ids**; runtime build **324 files / 7.73 MiB** at
commit `4bee9d1c5444d10555302cc397db915db24fb3c3`. Preview receipt
`4f5e41ad-dfa5-4269-84a7-f3ea56691220` (19:21:29–19:21:33Z) and production
receipt `c3fc3920-059a-442b-ba7d-d356b968f6c0` (19:21:36–19:21:40Z) both
succeeded; both environments report `published:true`. Both origins return
HTTP 200, serve that commit in `version.json`, and match the runtime
`js/presentation/rendering/terrain.js` SHA-256
`80a62a916c703c5e8ccdc2078e0e5914790f9967f8f66d14b312dd0e17f158b0`. A live
production camera/season jump recorded zero page errors, console errors, failed
requests or HTTP errors and reached `water.ice:true`. Full record:
[docs/TAIGA.md](docs/TAIGA.md#low-end-performance).

### 3.16.1-dev — Taiga fuel staffing and measured low-end proof

**Released:** 2026-11-14

**Scope:** Close the remaining Taiga campaign gap without changing the
fail-closed sweep gate, and replace assumed low-end performance with a real
Taiga summer / winter-ice / populated-settlement measurement.

**Fuel staffing fix:** the one-shot fuel replacement was previously gated only
on the store being at or below 18 firewood. The Taiga seed `20261108` already
reached all 13 ambitions, but its sick fuel worker fell ill in summer with 45
firewood while the store only fell low in winter and spring; the two conditions
never overlapped. `fuelStaffingGap()` in `js/simulation/villagers.js` now also
treats a completed lumber camp or sawmill with a sick worker and fewer healthy
workers than its capacity as a fuel emergency. The low-reserve path remains,
the same one-shot lease and illness guard apply, and `sweep-results.mjs` was not
weakened. The observed `20261108` order is year 25 / tick 9720: a real resident
replaces the sick sawyer, becomes `sawyer`, and receives a lease through tick
9820 while the store holds 47 firewood.

**Taiga campaign (25 years, three seeds):**

| Seed | Requirements | Ticks | Firewood | Population | Gold | Fuel orders | Max per phase |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `20261108` | all true | 10,040 | 50 | 74 | 4,686.99 | **1** | **1** |
| `20261110` | all true | 10,040 | 46 | 70 | 4,392.17 | **7** | **1** |
| `20261111` | all true | 10,040 | 47 | 74 | 4,727.48 | 0 | 0 |

Sweep result: `ok:true`, 3/3 seeds green, eight real orders in eight phases,
no game over and no stalled sites at 0.908–1.088 ms/tick. The unchanged savanna
reference sweep also exits 0: 3/3 seeds, every requirement true, 29 orders in
29 phases, max one per phase, 0.634–0.892 ms/tick.

**Low-end Taiga proof:** real realm, 1366 × 768, 4× CPU throttle, software
Canvas2D, 70 % render scale, 60 FPS cap, seed `20261108`, forests 75, two
years, 30 buildings and 23 residents. The harness counts real Canvas2D
primitives while `drawWorld()` is active and records visible entity/carrier
counts. Budgets: p95 ≤ 33 ms, ≤ 15 % over 33 ms, ≤ 3 % over 50 ms, zero long
tasks, 1,500 draw calls p95, 120 entities p95 and 16.7 ms canvas draw p95.

| Scene | Frames | p95 frame | >33 ms | >50 ms | Long tasks | Draw calls p95 / max | Entities p95 | Canvas draw p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Summer waterway | 479 | **16.7 ms** | 0 % | 0 % | 0 | **164 / 226** | 0 | 1.1 ms |
| Frozen winter water | 480 | **16.7 ms** | 0 % | 0 % | 0 | **174 / 515** | 0 | 1.6 ms |
| Populated settlement | 478 | **16.8 ms** | 1.46 % | 0.63 % | 0 | **412 / 679** | 20 | 6.5 ms |

The winter scene reports `water.ice:true` and the summer scene at the same
camera reports `false`. Quiet and dense controls also pass at p95 16.8 ms with
zero long tasks; a real save took 192 ms and load 1,394 ms. The first scene run
sampled 50.1 ms p95 while the staged terrain detail was rebuilding after the
camera/season switch; the harness now waits for `isTerrainDetailSettled()` and
a bounded warm-up. The final steady state is 16.8 ms with 6.5 ms draw p95; no
steady per-frame Taiga hotspot remained. A startup-only 69 ms long task was
likewise removed from the steady sample by the five-second warm-up.

**Verification:** full `npm test` **966/966**; syntax and relative imports clean
for **147 source files / 201 UI ids**; runtime build **324 files / 7.73 MiB** at
commit `67c6395bc5a7edab50ac2e131d4436eb39e3e506`. Both deployed origins return
HTTP 200, serve that commit in `version.json`, and match the runtime
`js/simulation/villagers.js` SHA-256
`01040c124ffd17aaef594e39044bb82f511a02cde49347c38c6f332d224331f1`. Preview
receipt `3ecddb96-6286-49d4-8678-0753dc2e5d85` (18:17:17–18:17:19Z) and
production receipt `71cac150-91e6-4141-bea6-f4d1e8da3d52`
(18:17:22–18:17:24Z) both succeeded; both environments report
`published:true`. A live production load on this build selected Taiga, founded
a 176 × 176 realm, showed the frozen winter shoreline, and recorded **zero page
errors, zero console errors, zero failed requests and zero HTTP errors**. Full
record: [docs/TAIGA.md](docs/TAIGA.md) and
[docs/CAMPAIGN_VERIFICATION.md](docs/CAMPAIGN_VERIFICATION.md).

### 3.16.0-dev — Taiga (1.2.10)

**Released:** 2026-11-14

**Scope:** Add the complete 56-point Taiga climate as a dedicated living biome,
not a recolour of the temperate forest. Ten formations cover old spruce forest,
pine ridge, larch stand, birch island, mixed taiga, forest clearing, tundra
ecotone, peat bog, taiga lakeshore and rocky woodland. Five taiga forest stand
types join the existing shared stand model without renumbering any old forest
index, and real snowbreak, windthrow, fire and bark-beetle disturbances use the
same resource nodes as lumberjacks and sawmills.

`taiga-ecology.js` derives soil, water, vegetation, fauna, goods, hazards and
economy from height, moisture, temperature, season, weather, wind and real land
use with no extra tick loop or per-tile save data. `taiga-render.js` draws the
bounded moss/lichen floor, lake and ice, sedges, berry shrubs, flowers, deadwood,
exposed roots, snow, fire scars, wildlife and four tree silhouettes. Gathering
checks taiga after tundra and before savanna; lake fish delivers food, boreal
herbs and bear fat deliver medicine, and five new goods join the single ledger.
Long winters raise fuel demand, shorten the growing season, slow snow-season
movement and make stored winter supplies and waterways economically important.
The 56-point audit is in [docs/TAIGA.md](docs/TAIGA.md).

**Verification:** `npm test` **965/965** including the new ecology, generated-
world resource and renderer suites; all 56 requirement IDs and all ten
formations are reachable in the deterministic survey. The final runtime package
is **324 files / 7.72 MiB**. Preview receipt `508adf3a-6b45-440d-b377-6e199f41920f`
(17:44:13–17:44:16Z) and production receipt
`7b2939ed-8577-48da-ad2a-7c15e88d13f6` (17:44:24–17:44:27Z) both succeeded;
both environments report `published:true`. Both origins return HTTP 200 and
serve `version.json` for commit `1279dee51e4eee60f8144a7bf5cd522409eb4f66`,
with matching SHA-256 for `taiga-ecology.js`
`17078cc4d2df7db269cd1146d3e2dc3c6c1c43bac6fa80b1f642f486763500da` and
`taiga-render.js`
`135f3b35854ef1c8d50a77a65db5a0286c9b801757037c4d30788bba1e6e2f79`.
A live production load exposed the Taiga option, founded a 176 × 176 taiga
realm, and rendered a mixed taiga forest with a frozen winter lake. No page or
console errors were emitted.

### 3.15.0-dev — Campaign seed sweep and eight-climate low-end proof (1.2.11)

**Released:** 2026-11-14

**Scope:** Close the campaign fuel-backfill diagnostic honestly on the
eight-climate world, remove the stale limitation note, and re-prove the
low-end frame, save/load and memory budget on the heaviest savanna scene. No
campaign requirement was weakened and no event, illness or worker was
hand-placed.

**Campaign verification:** the reference runner now supports a documented
seed sweep (`npm run test:campaign:sweep`). All three savanna seeds
`20261106`, `20261143` and `20261152` reach 10,040 ticks with every real
requirement true, 13/13 ambitions, no stalled sites and no game over
(0.605–0.619 ms/tick). Across the sweep the ordinary annual health simulation
produces **two real illness-to-fuel-backfill orders in two phases** on seed
`20261152`: a sawyer falls ill in years 7–8, the normal workforce logic
replaces them and the replacement receives the one-shot fuel lease. The other
two seeds remain fully green with zero orders. Aggregation is fail-closed:
every seed must pass every requirement, no worker phase may receive more than
one order, and the whole sweep must contain at least one real order. The
extracted `tests/campaign/sweep-results.mjs` is covered by
`tests/campaign/sweep-results.test.js` (4/4). Requirements and evidence:
[docs/CAMPAIGN_VERIFICATION.md](docs/CAMPAIGN_VERIFICATION.md). The old
"harness coverage limit" note is removed from this changelog and
`docs/SAVANNA.md`.

**Savanna wind cache:** the animated tall-grass overlay previously rebuilt the
complete savanna ecology profile (grasses, trees, fauna, goods, soils and
hazards) for up to 260 scanned tiles on every rendered frame. It now caches the
four values it actually draws (tall-tuft flag, sway, grass colour and alpha)
in a hard-bounded 8,192-tile map. Invalidation keys cover the world seed,
terrain version and sampled terrain maps, climate/forest/aridity options,
explored/terrain/road/building revisions, season, year, day bucket, weather,
wind and land-use bucket; the cache never holds full profiles and a change in
any input clears it. In the accelerated-canvas diagnostic on the same host,
wind-path draw p95 fell from 25.4 ms to 13.7 ms quiet and 14.1 ms to 8.5 ms
dense; app work p95 fell from 32.9/19.7 ms to 19.4/14.7 ms in that diagnostic. A focused test
proves reuse, zero misses on an unchanged frame and weather invalidation
(`tests/presentation/grassland-render.test.js`, 6/6).

**Low-end proof:** the shipped low-end profile is 1366×768, 4× CPU throttle,
Auto terrain on Canvas2D, 70 % render scale, 60 FPS cap, two in-game years, and
the software Canvas2D/compositor path used when a device has no usable GPU
(`PERF_SOFTWARE_CANVAS=1`). The harness preloads the settings before founding,
so the quiet phase measures play rather than a post-start terrain rebuild. The
eight-climate scene is savanna, forests 85 (woodland and forest clearings) and
a real settlement on seed `20261152`. Final run (`npm run
test:performance:eight-climate`, exit 0):

| Phase | Frames | Median | p95 | >33 ms | >50 ms | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Quiet realm | 479 | 16.7 ms | **16.8 ms** | **0.63 %** | **0 %** | **0** |
| Dense mature realm | 601 | 16.7 ms | **16.8 ms** | **0 %** | **0 %** | **0** |
| Population panel | 476 | 16.7 ms | 16.7 ms | 0.42 % | 0.21 % | 0 |
| War/diplomacy panel | 472 | 16.7 ms | 16.8 ms | 0.64 % | 0 % | 0 |

Quiet/dense draw p95 is **7.8 / 7.6 ms** and simulation p95 is **4.9 /
3.3 ms**; app work p95 is **11.5 / 10.4 ms**. A real production save took
**170.1 ms** and load **1048.8 ms** (906,134-byte save), both under the new
1000/2500 ms budgets, with no page or console errors. Warm retained heap grew
**2.12 %** after bounded caches filled; the cold-start report still records
+34.56 % and is kept for visibility. The harness now samples the real
`state.performanceProbe` work per presented frame, preloads settings, drives
the production save/load controls directly, and gates heap growth only after
the one-time cache warm-up.

**Verification:** focused savanna render 6/6, campaign aggregation 4/4, full
`npm test` **950/950** with syntax/relative imports clean for 145 source files
and 203 UI ids. Complete browser E2E is green across world forge, drag
placement, save/load, gathering, production, ecology legacy save and large
orders. The three-seed sweep exits 0, and the eight-climate low-end proof exits
0 with the numbers above.

### 3.15.0-dev — Savanna and the living grassland (1.2.10)

**Released:** 2026-11-14

**Scope:** Savanna becomes the eighth dedicated climate instead of a warmer
variant of `arid` or `grassland`. A deterministic ecology module derives ten
formations (open grass plains, acacia savanna, baobab grove, riparian corridor,
dry riverbed, thorn scrub, termite-mound field, seasonal pan, burned grassland
and rocky kopje) from height, moisture, temperature, season, weather, wind and
real land use. The profile carries the wet/dry pulse, laterite soil, seasonal
pans and waterholes, dry riverbeds, grazing and fire pressure, drought, heat,
predator, water-scarcity, flood and livestock-disease risk, and the full
48-point vocabulary.

**Integration:** `terrain.js` gives savanna priority over desert, steppe and
grassland and suppresses closed forest; `savanna-render.js` draws a bounded
ground and detail layer. Sparse savanna woodland is seeded on the grassy belt
below the old forest line as well as above it, so a lowland start has logs,
lumberjacks and firewood without a closed canopy. Gathering, the shared good
ledger, farm/stable surveys, movement costs, harvest yield, spoilage, the
climate selector and savanna's milder hearth-load interval all read the same
climate profile. Existing worlds and saves keep their settlements and terrain
unchanged.

**Verification:** focused savanna ecology, rendering and resource tests 12/12;
full `npm test` 945/945 with syntax and relative imports clean for 145 source
files / 203 UI ids; complete browser E2E green; 25-year temperate campaign
10,040 ticks, 13/13 ambitions, 0.830 ms/tick, no stalls and no game over; a
25-year savanna campaign on seed 20261106 reaches the same 10,040 ticks and
13/13 ambitions with every campaign requirement true, 46 firewood in store,
no stalls and no game over at 0.585 ms/tick. This seed records no
fuel-backfill order; the later 1.2.11 documented seed sweep adds seed
`20261152`, where ordinary sawyer illness produces two real orders while all
requirements remain true. The deterministic browser reference captures all ten
formations and one seasonal pan through four seasons.

### 3.15.0-dev — Tundra and the living permafrost (1.2.9)

**Released:** 2026-11-14

**Scope:** Tundra becomes the seventh climate instead of a colder variant of
`northern`. A dedicated, deterministic ecology module derives moss, lichen,
dwarf-shrub, willow-thicket, berry-heath, sedge-wetland, frost-polygon, rocky,
coastal and snowfield formations from height, moisture, temperature, season,
weather, wind and real land use. The profile carries permafrost and a summer
active layer, thaw depth, polygons, cracks, hummocks, bearing strength, pools,
peat, ten formations, cold-adapted fauna and the full 48-point vocabulary.

**Integration:** `terrain.js` gives tundra priority over the other biomes and
suppresses tall forest; `tundra-render.js` draws a bounded detail layer. The
shared forest, gathering, goods, hauling and farm/stable survey systems carry
the new products. Rare low subalpine-scrub stands give the lumber chain a small
renewable timber and fuel source without painting a forest over the tundra.
Harvest yield, spoilage, winter/spring movement, farm and stable summaries and
the climate selector all read the same climate profile. Existing worlds and
saves keep their settlements and terrain unchanged.

**Verification:** focused tundra ecology and rendering 10/10; full `npm test`
933/933 with syntax and relative imports clean for 143 source files / 203 UI
ids; complete browser E2E green; 25-year temperate campaign 10,040 ticks,
13/13 ambitions, no stalls and no game over; a 25-year tundra campaign reaches
the same 10,040 ticks and 13/13 ambitions. The deterministic browser reference
`npm run test:tundra-reference` captures all ten formations and one wetland
through four seasons.

### 3.15.0-dev — Loaded realms keep their HUD and realm issues

**Released:** 2026-11-14

**Cause:** Loading a saved realm calls `resetForRun()`, which clears
`state.hasStarted`, and then restores the snapshot. The load path hid the start
screen and resumed the simulation, but never marked the restored realm as
started. `renderUI()` therefore returned at its first guard on every call: the
loaded realm stayed visible but its HUD stopped refreshing, and the chronicle
could not reopen an active realm issue because the modal was never painted. The
browser E2E caught this at the issue-reopen fixture, several minutes after the
real save/load action that caused it.

**Fix:** `loadSnapshotIntoGame()` now sets `state.hasStarted = true` after a
successful restore and before its first render. The browser E2E asserts the
readiness flag immediately after the existing real load, next to the action that
regresses it.

**Verification:** `npm test` 922/922 with syntax and relative imports clean for
141 source files / 203 UI ids; complete browser E2E green with no page or console
errors, including dismissing and reopening the chronicle issue; Royal
Expeditions browser audit green; 25-year campaign 10,040 ticks, 13/13
ambitions, no stalls, no game over, 0.835 ms/tick (previous baseline 0.861).

### 3.15.0-dev — Royal expeditions and the living frontier

**Released:** 2026-11-14

**Scope:** A persistent exploration layer built from the systems the realm
already owns. Every world seeds eight deterministic landmarks (sunken ruins,
cave, shrine, watchtower, crater, grove, barrow and caravanserai) from its seed
and keep position. A named, living adult resident can lead one party at a time;
their command, learning, care and trade skills, the chosen supply level and the
site's danger decide a triumph, success, costly return or disaster. Supplies
are paid from real food and gold, distance extends the journey, arrival calls
the existing fog reveal, and loot is credited only when the party is home.
Injury uses the existing illness field, disaster touches morale, and first
discoveries feed person memories, legacy, the event log and a bounded lore
archive. A cleared site can be surveyed again for a smaller cache without
duplicating its principal lore.

**Integration:** The normal simulation tick calls `updateExpeditions()` once;
there is no new loop, renderer or resource. The save snapshot persists a
normalized `expeditions` block inside schema 11, loading repairs old or missing
blocks, and the validator rejects malformed records. The command deck gains an
EXPLORE tab backed by a dedicated panel, with leader/supply selection, eight
landmark cards, live travel progress, returned reports and recovered fragments.
The panel refreshes on a real `kac:expedition-change` event when travel
resolves.

**Verification:** Focused domain, save and UI-contract tests pass 7/7. Full
`npm test` passes 922/922 with syntax and relative imports for 141 source
files and 203 referenced UI IDs. The 25-year campaign completes 10,040 ticks,
13/13 ambitions, `noStalls:true`, no game over and 0.861 ms/tick. The real
browser audit (seed `20261114`) founded a realm, opened EXPLORE, counted eight
landmarks, chose a named leader and grand equipage, launched and resolved a
triumph, verified the completed/surveyed/fragment counters, the history row,
the lore card and the save snapshot, and produced no page or console errors.
Reference frames are in
[docs/expeditions-reference/](docs/expeditions-reference/); the full design and
save contract are in [docs/EXPEDITIONS.md](docs/EXPEDITIONS.md).

**Deployment:** Hosted preview and production are published from this commit;
the Freebuff Sites receipts and origin checks are reported with the release
hand-off.

### 3.15.0-dev — Deserts and semi-deserts (spec 1.2.8)

**Released:** 2026-11-13

**Scope:** All 75 requirements `1.2.8.1`–`1.2.8.75` are implemented and
covered by an explicit ID audit. Deserts are a deterministic ecology layer,
not a recoloured grassland. The new `desert-ecology.js` derives ten formations
(sand sea, dune field, rock, gravel, pebble, salt, semi-desert, cold, mountain
and dry-basin desert) from height, moisture, temperature, climate, season,
weather, wind and land use. Four sand colours and five dune types feed the new
`desert-render.js` detail layer: crests and lee slopes, wind scour, gravel,
salt crust, boulders, cliffs, mesas, canyons, caves, thorn scrub, succulents,
rain flowers, palms, oasis water and fields, caravans and desert wildlife.
Cold desert is reachable in an arid world through high, dry mountains rather
than a special-case tile.

**Integration:** The existing terrain priority now chooses desert before
steppe and grassland, palms use the shared tree lattice, and the wind pass
accepts the desert profile. Forest ecology registers the desert goods; the
gathering paths check desert before steppe and grassland and deliver dates as
food, desert herbs as medicine and the remaining goods through the shared
ledger. `grasslandSiteSummaryAt()` exposes the desert profile and oasis
water/fields to the existing farm and pasture overview. There is no new tick
loop and no new save field; every per-frame loop is bounded and every profile
is deterministic.

**Verification:** Focused desert tests pass 10/10, including the exact 75-ID
set, complete vocabulary, determinism, bounded values, a ten-tile survey that
reaches every requirement, all ten formations, four sand colours, five dune
types, oasis services, hazards and goods delivery. Full `npm test` passes
915/915 with syntax and relative imports for 139 source files and 203
referenced UI IDs. The 25-year campaign completes 10,040 ticks / 13 of 13
ambitions with `noStalls:true`, no game over and 0.842 ms per tick. The browser
reference generated all ten formations as real tiles at 2.4× interior zoom
(seed `20261100`, 176×176 arid world, aridity 100, WebKit WebGL 800×800); the
formation sheet and four-season oasis strip are in
[docs/terrain-reference/desert-reference.png](docs/terrain-reference/desert-reference.png)
and [docs/terrain-reference/desert-seasons.png](docs/terrain-reference/desert-seasons.png).
The full implementation and 75-row audit are in [docs/DESERTS.md](docs/DESERTS.md).

**Deployment:** Hosted preview and production are published from this commit;
the Freebuff Sites operation receipts and final origin checks are reported with
the release hand-off.

### 3.15.0-dev — Visual delivery audit and command-emblem repair

**Released:** 2026-11-13

**Scope:** Post-release visual acceptance of the hosted build (`32bf99c`) at the
real Production origin, plus the one defect that audit exposed. No simulation
rule, save schema, terrain colour or camera behaviour was changed.

**Visual evidence:** A fresh realm (seed `20261108`, 23 residents, 30 buildings,
56 entities) was captured after normalising the clock to Year 1, day 50, noon,
clear weather so the Production and `5cbf350` frames can be compared directly.
The set contains the overview at Landscape ×0.09, Rooftops ×0.95 and Interiors
×2.40, plus the POPULATION, ECONOMY, BUILDINGS and CREATURES panels. Terrain
coverage is complete: the landscape reference has 0 % black pixels and 83,499
colours; the overview contains only 0.3 % dark fog-of-war area, and the two
close views contain none. Buildings, residents, trees, resource icons, HUD
rings and panel icons are all present. No page errors, console errors or failed
requests occurred while opening the panels, zooming and panning; the only
browser messages were the known SwiftShader `ReadPixels` warnings.

Against `5cbf350`, the roof-level terrain below the fixed top bar is
pixel-identical (mean absolute difference 0.011, 0 % of pixels above 3). The
landscape differs by a mean of 0.85 levels, with 99.99 % of pixels within 10
levels; every difference above 50 is confined to the top bar's live morale and
treasury text, not the world. Zooming, panning and starting the realm left the
population, building and resource numbers unchanged.

**Root-cause fix:** The static asset audit found 18 external SVG references, of
which 17 resolved. The CREATURES tab referenced
`assets/command-emblems.svg#dragon`, but that atlas contained only crown,
scales, seal, cards, coins, book and people. The panel therefore had no dragon
emblem. A matching heraldic dragon symbol was added; the audit now resolves
18/18, and the deployed CREATURES panel shows the emblem and its illustration.

**Performance attribution:** The old shipped build mixed two effects. Applying
the low-end settings after the realm was already running measured 7.522 % of
quiet frames above 33 ms; preloading the same settings measured 1.891 %. The
latest post-start-settings run measured 3.457 % above 33 ms, 16.8 ms p95,
0.247 % above 50 ms and one Long Task; the dense phase measured 0 % above
33 ms, 0 % above 50 ms and no long tasks. Timestamp probes still show occasional
single heavy simulation ticks (31.5 ms at the day-90 fauna/services pass) and
terrain-cache rebuild slices, so the residual is not claimed to be exclusively
a harness artefact. Two guards are now in place. A delayed frame executes at
most one fixed simulation step and keeps the rest in the accumulator, so a
catch-up frame can no longer run several settlement ticks back-to-back; every
tick still runs in the original order and the deterministic campaign does not
use wall-clock pacing. The forest-habitat cache ceiling rose from 12,000 to
20,000 entries so a full 160×160 default forest map stays resident: the
day-90 tick probe fell from 41.2 ms to 31.5 ms, quiet tick p95 from 16.0 to
13.1 ms, and the dense phase reached 0 % over 33 ms. The cache remains bounded
and is still invalidated by geography, succession, climate and forest-option
changes.

**Verification:** `npm test` 905/905 with the syntax, relative-import and UI-id
check passing for 137 source files and 203 referenced UI ids. The 25-year
campaign ends at 10,040 ticks with `allComplete:true`, all intermediate, era and
agenda requirements true, and `noStalls:true` (0.841 ms/tick). Visual proof:
[artifacts/visual-proof](artifacts/visual-proof/).

### 3.15.0-dev — Cold-start frame budget (realm start pass)

**Released:** 2026-11-13

**Scope:** The cold start of the hosted build on the low-end profile
(1366×768, 4× CPU throttle, 8 s quiet / 6 s dense). Rendering, map detail,
save schema and the deterministic campaign are unchanged.

**Changes:** The opening realm is now assembled before the start screen lifts:
terrain detail is settled, room/modifier/herd/chronicle caches are warmed, the
opening routes and resident paths are memoized, and the first production cycle
runs behind the overlay. `state.hasStarted` is only set when that work is done,
so neither the runtime nor the save path can observe a half-founded realm.
Large settlements spread their six-tick production batches over three stable
entity-id phases instead of booking every building in one block; small
settlements keep the old single batch so the production contract in isolated
tests is unchanged. The settlement fields scan entities once and reuse the
stable list, the economy modifier caches are precomputed, and the recycling
goods ledger keeps an exact idempotency-key index. The A* cache is keyed by
tile, resident search trees are typed arrays with generation stamps and a
bounded per-movement expansion budget, and only one resident search runs per
movement call. The HUD refreshes at 1.5 s and the minimap at 4 s, while the
first full HUD and world paint happen behind the overlay. The carrier render
path no longer builds the complete logistics snapshot, and top status reads the
cached sovereign instead of rebuilding the royal house.

**Before (5cbf350) / before this pass (2ab825a) / now (same host, clean runs):**

| Phase | p95 frame | >33 ms | >50 ms | Long tasks |
| --- | --- | --- | --- | --- |
| Quiet cold start | 83.4 / 33.5 / **16.8 ms** | 88.4 / 27.7 / **2.56–4.83 %** | 31.4 / 1.94 / **0–0.44 %** | 12 / 3 / **0–1** |
| Dense mature | 66.7 / 33.3 / **16.8 ms** | 49.3 / 8.2 / **0–0.56 %** | 8.45 / 0.61 / **0 %** | 10 / 0 / **0** |

Median frame time is 16.7 ms in both phases. Quiet tick p95 is 10.6–13.5 ms;
dense tick p95 is 11.3–13.8 ms. The two clean final runs had no
quiet long tasks and no frame over 50 ms. A control run with the low-end
settings preloaded cut quiet frames over 33 ms from 7.522 % to 1.891 %, which
isolates most of the residual as harness settings application and terrain-cache
settling; timestamp probes still show a few single heavy settlement ticks and
cache-rebuild slices, so not every residual frame is a harness artefact. One
host-contended repeat measured 0.44 % over 50 ms and one Long Task; the other
final runs measured zero in both. The 2ab825a build still had three quiet long tasks
(largest 82 ms) and 1.94 % over 50 ms; those are gone.

**Verification:** `npm test` 905/905 and the syntax/relative-import/UI-id check
passes for 137 source files and 203 UI ids. The deterministic 25-year campaign
still ends at 10,040 ticks with `allComplete:true`, all intermediate/era/agenda
requirements true and `noStalls:true`. The terrain browser reference renders on
WebKit WebGL and exits 0; its generated reference files are left untouched when
the pixels are unchanged.

### 3.15.0-dev — Low-end render budget (performance pass)

**Released:** 2026-11-13

**Scope:** Frame-time work for the shipped hosted build on the low-end profile
(1366×768, 4× CPU throttle, 8 s quiet / 6 s dense). No gameplay, save-schema or
simulation change.

**Changes:** The first terrain detail raster is now built in 3 ms slices while
the start screen still covers the realm; the game loop starts only after the
layer is settled, so the first playable frames do not carry the cold build. A
cold build paints directly on the visible terrain surface instead of waiting
for a full offscreen staging pass. Building artwork is painted once per tick
into a reusable per-building sprite and blitted between ticks, with a 1 ms
per-frame refresh budget and a bounded cache. The district person badge (ring,
status colour, emoji, crown) is a cached glyph sprite; bob, lean, feet and draw
order remain per entity. HUD chunks run one per task between animation frames
instead of sharing the world frame. Furniture upkeep reuses the existing room
snapshot instead of walking every building twice.

The measured gains come from the building sprite cache and the visible cold
start; a terrain prewarm loop, entity-sprite prewarm and banded ground blit
were each reverted after they failed to improve the same harness.

**Before (5cbf350) / after (same host):**

| Phase | p95 frame | >33 ms | >50 ms | Long tasks |
| --- | --- | --- | --- | --- |
| Quiet cold start | 83.4 → **33.5 ms** | 88.4 → **27.7 %** | 31.4 → **1.94 %** | 12 → **3** |
| Dense mature | 66.7 → **33.3 ms** (best run 16.8) | 49.3 → **8.2 %** | 8.45 → **0.61 %** | 10 → **0** |

Median frame time is 16.7 ms in both final phases; dense tick p95 is 15.8 ms
and draw p95 4.2 ms. Three quiet-phase long tasks remain (largest 82 ms); the
realm start itself is no longer one of them.

**Verification:** `npm test` 905/905 and the syntax/relative-import/UI-id check
pass for 137 source files and 203 UI ids. The deterministic 25-year campaign
still ends at 10,040 ticks with `allComplete:true` and `noStalls:true`. The
terrain browser reference renders on WebKit WebGL and exits 0.

### 3.15.0-dev — The Second Crown and its Era Agenda

**Scope:** A one-time post-ambition fork. After the thirteenth royal ambition,
the realm receives **The Second Crown**: three authored directions for the next
age. The choice awards a bounded resource, morale, faction and hidden-realm
package, permanently biases existing event weights, and opens a three-stage era
agenda that reshapes ordinary simulation.

**Content:** **The Common Weal** favours harvests, festivals and migration;
**The Guild Compact** favours caravans, guilds and craft; **The Royal
Ascendancy** favours succession, taxation and the border. Each path records a
legacy entry and persists in `state.ambitions.era` without a save-schema bump.
The choice is delivered through the existing realm-event modal and scheduler.

**Reachable agenda:** Common Weal now asks for food, housing capacity and then
population. Guild Compact asks for treasury, collected taxes and more treasury.
Royal Ascendancy asks for legitimacy, a war chest and collected taxes. The
Guild/Crown stages previously depended on manual trades, soldiers and prestige
that the deterministic campaign never produced; they now use the already-running
treasury and tax flows. The campaign builder responds to the Common Weal housing
objective by building the next cottage through the normal construction and
logistics paths. The final ambition gate now opens at year 20 instead of year 25;
its population, treasury and morale requirements are unchanged. The 25-year
audit therefore has five years for the post-ambition era and reaches all three
Common Weal stages in years 21–23 without changing a target or a test check.
The campaign player may add real farms while the granary stage is open, and the
four-seed/three-profile audit may buy grain through the existing market; both
are ordinary actions, not grants.

**Persistent consumers:** Common Weal changes `foodDemandFactor` in the economy
and `migrationFactor` in population growth. Guild Compact changes
`taxEfficiency` in the economy and `tradeFactor` in the market. Royal Ascendancy
changes annual `legitimacyYear` drift in politics and `unrestFactor` on rebellion
event weights. Old era saves without an agenda normalize to a clean first stage.

**Verification:** focused ambition tests **20/20**; full `npm test` **787/787**;
50-year reruns after the gate are `ok:true` with **3/3 agenda stages** for Guild
Compact (years 22, 23, 25) and Royal Ascendancy (years 20, 22, 23). The
12-run player-profile matrix is 12/12 green, including `agendaStage` and
`agendaFeedback`, with no stalls or game over. Pre-gate Common Weal 50-year
reference: **0.902 ms/tick**; Guild **0.927 ms/tick**; Royal **0.904 ms/tick**. Observed transcript changes
include Common Weal population 73 → 74, legitimacy 98.28 → 100, morale 93.35 →
96.33, treasury 6,493.96 → 6,595.86, food demand 0.97 → 0.9506 and migration
1.0 → 1.12; Guild treasury 5,361.44 → 5,538.20, taxes 8,969.85 → 9,321.34, tax
efficiency 1.03 → 1.0609 and trade 1.05 → 1.0815; Royal Ascendancy legitimacy
98.32 → 98.34, nobility 68 → 70, treasury 5,005.88 → 5,211.11, and rebellion
weight 1.0 → 0.9. The 25-year campaign now finishes with **3/3 Common Weal stages** and all
campaign requirements green; the 50-year Guild Compact and Royal Ascendancy
reruns also finish 3/3. The Chromium chronicle audit still completes both
chronicles, chooses Guild Compact, shows `ERA AGENDA · 1 OF 3` with `167 / 517
gold`, and reports **0 page and 0 console errors**.

**Not covered yet:** the three campaigns use one seed and the builder profile;
they do not cover every build order or player strategy. The browser audit checks
the stage-one agenda HUD but does not complete an agenda stage in the browser.
There is no separate scalar stability statistic; legitimacy, morale and faction
support represent stability. No deployment was performed.

### 3.15.0-dev — Tropische Regenwälder (1.2.4)

**Status:** released on `ulmweb-branch`; production https://kings-and-cards.pages.dev/ is verified after each release build.

**Scope:** The tropical rainforest extends the one shared forest model instead
of adding a second ecosystem. A sixth climate profile carries humid heat, a
wet/dry rhythm, an evergreen canopy and only rare highland snow. Thirteen tree
species and twelve formations are appended after the existing thirty-nine, so
every numeric save index stays stable; the vocabulary now holds thirty-three
species and fifty-one formations. The derived stand exposes all sixty-five
required rainforest points individually through `TROPICAL_POINTS` and
`stand.tropical.features`: giant emergents, buttresses, lianas, epiphytes,
palms, bamboo, giant ferns, big-leaf plants, orchids, bromeliads, pitcher
plants, pools, flood pulses, swidden plots, plantations, river trade, hazards
and medicinal bark.

**Presentation:** The renderer now separates emergent, spreading, vase, banyan,
airy and understorey silhouettes, adds a denser closed tropical canopy, hanging
lianas, epiphytes and bromeliads, and gives each formation its own ground wash,
understorey mix and land-use marks. Floodplain, swamp and riverbank keep a
lighter crown cover so their wet ground and alluvial gaps stay readable. A
separate tropical floor pass prevents the temperate leaf/moss/fern pass from
painting over the tropical water, fields and tracks. Tropical ground keeps its
green wet/dry palette through the calendar year instead of turning autumn
copper or winter grey; the seasonal sheet shows wet-season flush, main
fruiting, dry-season peak and the warm rainy season under an evergreen canopy.
Fauna, gathered goods, spoilage, work penalties and quinine/fever-bark medicine
all flow through the existing simulation, survey and economy paths.

**Chronicles:** two new three-stage authored arcs extend the event library:
**wildlife** follows a herd from the field boundary to a royal warden charter,
and **fishing** follows a silver run through a shared-weir dispute to a river
compact. Both link choices to resources, morale, hidden prosperity/tension and
political factions, and can award `deer` or `river-weirs` cards. They reuse the
existing chronicle queue, participant memories and save format.

**Verification:** `npm test` 771/771; syntax and relative imports clean for 107
source files / 189 UI ids; focused tropical suite 8/8, tropical integration
7/7 and event-chain suite 5/5; browser reference 12/12 formations and four
seasonal frames on WebKit WebGL at 800 × 800; playability audit 1,200 ticks at
60 FPS with no page/console errors; full browser E2E passed (world forge, cards,
drag placement, save/load, military, health, faith/justice and forestry);
chronicle browser audit completed wildlife and fishing through all six stages,
drew all four queued rewards and verified every faction delta;
25-year campaign 10,040 ticks / 13/13 / 0.821 ms per tick; 100-year campaign
40,040 ticks / 13/13 / 0.823 ms per tick. The refreshed reference was checked
visually for the twelve formation silhouettes, dense canopy and readable
understorey.

**Audit pass:** The 65-point audit closed the remaining presentation gaps:
native primate, reptile, fish and amphibian silhouettes; jaguar/ocelot rosettes
and toucan/macaw colour; mid-storey trees; ancient hollows and beard moss;
medicinal, rare and toxic understorey plants; exposed roots, rotting logs and
rotting logs with fungus; streams, broad rivers, waterfalls, temporary flood water,
fish traps and mosquito vectors. Watercourses are limited to floodplain,
riverbank and montane formations so ordinary rainforest tiles never acquire
artificial blue stripes. The simulation pass then connected the remaining audit
paths: tropical goods deliver through real food, medicine, gold and timber
channels; gathered food spoils daily and on delivery; disease, parasites, poison,
predators and storms feed the existing health system; undergrowth slows villagers
and carriers through a cached movement factor; land-use crops and plantation goods
enter the economy with a river-trade bonus; and clearance/regrowth now modulate
forest succession. Full status and the explicit non-visual risk paths are
documented in `docs/TROPICAL_RAINFORESTS.md`.

### 3.15.0-dev — Mischwälder (1.2.3)

**Status:** development branch only; not a production release.

**Scope:** Completes the mixed-forest phase without a second woodland model. The
shared stand generator now returns a first-class mixture with ratios, dominant
species, group/mosaic pattern, age structure, canopy layers, understorey,
ecotone, seasonal light, autumn palette, food plants, habitat value, wood
grades, phenology and silvicultural uses. The numeric indices of the fifteen
broadleaf and twelve conifer formations are unchanged; the twelve mixed
formations are appended after them.

**Species and formations:** five new trees (ash, hornbeam, rowan, hazel,
willow) bring the forest vocabulary to twenty species; twelve new formations
cover oak–beech–birch–spruce, fir–beech–maple, pine with broadleaves, alluvial,
montane, open, dense, ancient, young, ecotone, coppice-with-standards and
selection forest. Grouped stands draw mostly from a tile's own species group;
even stands bypass the bias. A 5×5 coarse island hash reserves a minority of
grouped/mosaic tiles for a single broadleaf or conifer species, so small pure
islands occur inside the mixed matrix. The mixed share now weights conifer
pests, snowbreak and drought, so a spruce minority no longer receives a
pure-spruce disturbance rate. Control parties are priced for every disturbance
kind.

**Products and presentation:** new timber and gathered goods (ash keys,
hornbeam seeds, rowan berries, hazelnuts, willow withies, woodruff, valerian,
tinder fungus, elderberries) flow through the existing delivery ledger. The
forester survey exposes the mixture; the terrain renderer draws grass and herb
understorey; seasonal foliage covers the new species. The mixed visual
reference captures all twelve formations plus one stand through four seasons.

**Long-term gate:** A new century test runs 100 years / 40,000 daily
succession and regrowth steps with a real resource + succession save/reload
every ten years. It starts with 65 pure islands (49 broadleaf, 16 conifer),
keeps 63 through the century and reports 0 stand or succession fingerprint
mismatches across all ten reloads. Pure islands are derived from the saved
world and stock ratio; even stands still receive none.

**Verification:** focused mixed/forest suite 42/42; full `npm test` 751/751;
syntax and relative imports clean for 105 files / 189 UI ids; deterministic
25-year campaign `ok:true`, 10,040 ticks, 13/13 ambitions, no game over, 0.807
ms/tick; mixed reference 12/12 formations and four seasons on WebKit WebGL with
artifact hashes. A fresh Chromium/Playwright browser rerun matched the tracked
mixed reference 12/12 with 0 mismatches across 372 field comparisons (31 per
formation). The browser harness now waits for the decoration overlay to rebuild
before capturing, so a slow software renderer cannot save a ground-only panel.
No save schema bump; old saves keep every numeric formation index.

**Full record:** [docs/MIXED_FORESTS.md](docs/MIXED_FORESTS.md).

### 3.14.2 — Crown Legacy Roundtrip Fidelity

**Released:** 2026-11-10

**Scope:** Extends the save/load audit from the Merchant to all five Crown
Legacy paths and fixes the state changes found by those longer runs. No save
schema bump is required.

**Fixes:** Loading a realm no longer replaces a saved household treasury of
zero with the default starting wealth. Saved citizen roles, professions,
statuses, profession history and household assignments are authoritative
during load;
the loader no longer recalculates a job, moves a resident into another house or
writes a synthetic status/health change. Homes are reserved from the saved
population register before any unhoused entity is assigned. The journey harness
now selects the Grand funding tier, sells a bounded surplus through the shipped
market for the builder, and asserts the path-specific legacy instead of the
Merchant's Crown Treasury for every run.

**Verification:** focused Population/Crown Supply/Diplomacy/Justice tests
**49/49**; full `npm test` and the final five-path measurements are recorded
below with the release receipt.

### 3.14.1 — Save/Load Fidelity

**Released:** 2026-11-10

**Scope:** Closes the first full save/load roundtrip audit after 120 years, including the Crown Legacies. The audit found and fixed three persistence defects without a save-schema bump.

**Fixes:** Crown Supply history now preserves each settlement tick. Loading a realm preserves saved civic happiness, loyalty, health, immunity and census ticks instead of recalculating them from a partially rebuilt settlement. Entity restoration preserves a saved `null` aged-year and a missing immunity value instead of inventing year 1 or zero. Trade-history records now carry their realm id, and legacy null justice/optional history fields normalize without synthetic values.

**Verification:** `npm test` **736/736**; focused Crown Supply, Diplomacy, Justice and Population tests **47/47**. The Merchant journey over 120 years reached **48,008 ticks**, 42 residents, **16/16 Crown works**, **1/5 Crown Legacies** including The Crown Treasury, and 33 legacy entries. A UI save, full page reload and Continue load restored an exact semantic save snapshot: all 65 compared top-level fields, every live entity, homes and the authoritative population register matched, with no page or console errors. The loaded Endeavours panel showed 5 paths, 20 projects, 1 legacy per path, and scroll position 0. The comparison canonicalizes only documented derived caches (carrier paths, needs history/timestamps, visual anchors and warehouse stock summaries).

### 3.14.0 — Crown Legacies

**Released:** 2026-11-10

**Scope:** Closes the first post-100-year completion gap in Crown Endeavours. Each of the five paths now ends in one large, one-time Crown Legacy after its three works reach tier 5; completing all five records the Eternal Crown. The release also fixes a management-panel scroll bug found in the final browser screenshots.

**Content:** The builder's **The Living City**, warlord's **The Unbroken Watch**, diplomat's **The Concord of Crowns**, merchant's **The Crown Treasury** and scholar's **The Eternal Library** join the existing fifteen repeatable works. A legacy has its own reserve cost, annual work requirement and permanent modifier, uses the existing named overseer and funding controls, can be completed only once, and adds a legacy chronicle entry plus morale and legitimacy. The five legacies take the panel from 75 to 80 possible completions. Completing all five records **The Eternal Crown**, with an additional morale and legitimacy award and a visible panel banner. Old saves receive no legacy progress and remain loadable; no save-schema bump was needed.

**Interface fix:** the v3.14.0 screenshots showed the Endeavours intro clipped under the tab deck when the previous management panel had been scrolled. Selecting a tab now resets the command-content scroll to the top; action re-renders deliberately keep the player's position.

**Verification:** focused Endeavour tests **10/10**; full `npm test` **734/734**; deterministic 25-year campaign **`ok:true`**, 10,040 ticks, **0.728 ms/tick**, 13/13 ambitions; syntax and relative imports for **105 source files** / **189 UI ids**. The post-change browser run is the Merchant over 120 years: **48,008 ticks**, **0.622 ms/tick**, 42 residents, **16/16 works**, **1/5 Crown Legacies**, 288 trades, no game over, no page or console errors, and no overflow at 1600 px or 864 px. Five 100-year journeys were already green before this additive change (builder 13 works / 66 residents; warlord 14 / 50 / 2 battles; diplomat 14 / 54 / 4 alliances; merchant 15 / 42 / 240 trades; scholar 10 / 86 / 17 technologies). The legacies are a completion layer, not a claim that the game has been proven for 1,000 hours.

### 3.13.4 — Shared-Simulation Performance

**Released:** 2026-11-10

**Scope:** Closes the open 3.13.3 performance requirement without weakening simulation depth, ambitions, yields or save compatibility. Profiling and the measured 100-year/matrix record are in [docs/DEEP_PLAYTEST_3.13.4.md](docs/DEEP_PLAYTEST_3.13.4.md).

**The measured problem:** on one 8-vCPU Node 26 host the reference seed ran at **2.745 ms/tick** and seed 7 at **9.534 ms/tick** over 40,040 ticks. The profile named forest-fauna stand reconstruction (≈44 %), carrier pathfinding including a duplicate route after pickup (≈26 %), repeated building placement work (≈16 %), succession's per-tick `Object.entries` allocation (≈8 %), service workforce rebuilds (≈7 %) and repeated inventory normalisation in stock checks (≈6 %).

**Root fixes:** an exact fauna habitat cache keyed by stock, capacity, succession kind/age, climate and forest setting; one herd-occupancy map per simulated day; a route cache invalidated by world, building-collision and road revisions plus removal of the duplicate post-pickup carrier route; raw geography queries for placement/forester/survey instead of full stand construction; a cached static building list for overlap checks; allocation-free succession iteration with cached profiles and an exact live tile count; one workforce/active-service snapshot per settlement pass; and inventory checks that only initialise a missing store instead of re-normalising every store per product.

**100-year evidence:** every seed is green, at 70 residents, 13/13 ambitions, 0 unresolved stalls, 0 food shortage and no game over:

| Seed | Tick cost | Ticks | Eternal Deeds |
|---|---:|---:|---:|
| 20261108 | **0.995 ms** | 40,040 | 3 |
| 7 | **1.780 ms** | 40,040 | 2 |
| 99 | **0.847 ms** | 40,040 | 2 |
| 42 | **0.798 ms** | 40,040 | 1 |

Seed 7 repeated at **1.819 ms/tick**, so its observed range is 1.78–1.82 ms. The reference seed fell from 2.745 to 0.995 ms; seed 7 fell from 9.534 to 1.78–1.82 ms (5.2–5.4×). All four runs are faster than the requested 2.3–2.6 ms band; the 2.6 ms ceiling is met with margin and no artificial load was added to reach the lower bound.

**25-year matrix:** 4 seeds × 3 playstyles, **12/12 green**, all **13/13 ambitions**, **63–75 residents**, **0 unresolved stalls**, no food collapse and no game over. Tick costs are **0.758–1.137 ms/tick**. Every crown-relief attempt succeeded (1–3 per run, 0 failed).

**Verification:** `npm test` **724/724**; syntax, relative imports and UI ids **105 files / 189 ids**; habitat-cache regression covers immediate harvest and succession invalidation. The production URL is verified separately after Cloudflare Pages serves the exact release commit.

### 3.13.3 — Seed-Robust Living Realm

**Released:** 2026-11-10

**Scope:** Makes the unchanged 25-year `eternal-realm` ambition reachable through real population, relief and trade mechanics on four seeds and three playstyles. No ambition target, housing rule, mortality rate or resource yield was weakened.

**The dead end:** 3.13.2 documented seeds 7 and 99 finishing the deliberate 25-year route at 45 and 44 residents (12/13). The flat two-resident annual allowance shared by births and immigration put a hard ceiling on slower worlds. The previous clinic expansion was not a repair: clinics consumed labour and materials without producing food, starving seed 99 and stalling the reference seed.

**Mature immigration:** a realm that has survived ten years and still has water coverage ≥ 0.40, safety ≥ 0.35, household satisfaction ≥ 0.45, food ≥ 4 per resident, adequate morale, a free bed and an allowed villager can welcome **three residents per year** instead of two. Births still share the allowance. The allowance is re-evaluated every ten ticks, not every tick, and cannot bypass the normal settlement gate. The mature route is an immigration incentive, not a resource grant.

**Crown relief:** `crown-relief.js` turns a blocked visible growth gate into one costed action through the existing crown supply systems: the next waterworks level, a regional granary contract or emergency provision from held harvest and surplus goods, and a stone rebuild of an existing cottage for two extra places. The PEOPLE panel exposes it as `data-command="crown-relief"`. Safety and morale keep their real building/policy requirements; there is no purchased shortcut. A mature realm can sell surplus wood or stone above a 1,200 construction reserve through the real market path to cover relief costs, keeping a 2,400-gold reserve. No resources are created.

**Measured 25-year matrix:** 4 seeds × 3 policies (builder, settler, ignorer), all **12/12 green**, every run **13/13 ambitions**, **63–75 residents**, **zero unresolved stalls**. Seed 99's settler recovered two blocked sites and ended with 2,405 gold / 74 food. Reference 25 years: 13/13, 75 residents, 2.363 ms/tick. The seed 99 settler previously finished at 44 residents; it now reaches 66. No clinic was added and no ambition was lowered.

**Performance:** the reference 25-year route measured **2.363 ms/tick** and the deterministic 100-year route **2.423 ms/tick** over 40,040 ticks, both inside the requested 2.3–2.6 ms band. Alternate seeds measured 3.19–4.63 ms/tick; that terrain/entity-cost gap is documented, not averaged away. The 4,000-tick browser check held 60 FPS / 16.7 ms with 2.07 ms simulated work per tick, no page or console errors and no horizontal overflow.

**Verification:** `npm test` **723/723**; syntax, relative imports and UI ids **105 files / 189 ids**; full 12-run matrix; 100-year campaign 13/13 with 3 Eternal Deeds and 0 stalls; browser growth gate visible. Full record: [docs/DEEP_PLAYTEST_3.13.3.md](docs/DEEP_PLAYTEST_3.13.3.md).

### 3.13.2 — Visible Growth Gate

**Released:** 2026-11-10

**Scope:** A stalled population gate is now explained in the PEOPLE panel instead of appearing as unexplained stagnation. This is a presentation and diagnostics patch; yields, growth speed, save data and campaign balance are unchanged.

**The dead end:** the reference realm opened with 21 residents and 22 beds, then reached 18 residents after ten years with a free bed. The yearly settlement check was correctly rejecting newcomers because local safety was 0.2, below the 0.35 threshold, but the panel showed no reason and no recovery action. A player could only guess why housing was not attracting anyone.

**The fix:** `getPopulationGrowthGate()` is now the shared explanation path for the yearly growth update. The PEOPLE panel renders a `GROWTH GATE` block before its effects, naming housing, water, safety, food reserve or morale, with the concrete next step. The start state explains that a watchtower covering occupied homes is needed; an open realm says growth is open. The gate is read-only and uses the same settlement rules as the simulation.

**Verification:** `npm test` **719/719**; syntax, relative imports and UI ids **104 files / 189 ids**; browser playability 4,000 ticks at 60 FPS with the gate visible and no page/console errors; reference 25-year campaign **13/13, 59 residents, 2.288 ms/tick**; 100-year campaign **13/13, 70 residents, 3 Eternal Deeds, 40,040 ticks, 0 stalled sites, 2.563 ms/tick**. The three-seed audit still exposes low-health seeds 7 and 99 at 45/44 residents (12/13); the attempted clinic expansion was reverted because it starved the food chain and stalled the reference seed. That balance gap is documented, not hidden. Full record: [docs/DEEP_PLAYTEST_3.13.2.md](docs/DEEP_PLAYTEST_3.13.2.md).

### 3.13.1 — War Granary
**Released:** 2026-11-10
**Scope:** The last unmet v3.13.0 requirement: a warlord ending with a standing garrison and at least two years of food demand in reserve. A fourth grain-contract tier, four seasonal deliveries, harvest call-in, commissary barter and an emergency draw; the other four journeys keep their existing targets and improve.

**The remaining dead end:** v3.13.0 ended the warlord at 46 residents, 11 soldiers and 55 food. Annual demand was 298 (46 × 6 + 11 × 2), so the reserve covered 0.18 years; two years required 596, a 541-food gap. The last pre-release run reached 239 food but only 0.66 years of its 360 demand, 481 short of 720. Raising farm yields globally or moving the annual settlement would have changed the other four journeys and added per-tick cost.

**War granary:** Grain level IV targets `max(420, population × 4 + 60, ceil(annual demand × 2.5))`, where annual demand is residents × 6 + soldiers × 2 + mounted soldiers × 2 extra. It pays 1.10 gold per food and is the only tier delivered in four seasonal shipments; levels I–III keep their annual target and annual delivery. The economy panel labels level IV **WAR GRANARY · 2.5Y RATIONS** and shows annual demand and reserve coverage in years. The final warlord has 47 residents and 11 soldiers (including one mounted), demand 306, target 765, and 749.9 food — **2.45 years** — with **11 soldiers**.

**Commissary:** `PROVISION THE GRANARY` calls in grain already held by farms and warehouses (a transfer, not a new harvest), sells stone then wood above a 600/600 construction reserve through `executeTrade`, buys food at the contract rate, and barters directly at 2 wood or 3 stone per food when coin or market grain is exhausted. Level IV may use the last goods when below one year of rations. Grain purchases always preserve the `60 + 8 × soldiers` garrison payroll. The direct barter is available at every active grain level, with the 600/600 reserve; levels I–III keep annual delivery.

**Journey results (year 101, real UI):** builder **60 residents / 300.6 food** (0.82 years, was 140); warlord **47 / 749.9 / 11 soldiers / 2.45 years** (was 46 / 55 / 11 / 0.18); diplomat **60 / 420.1** (1.15 years, was 143); merchant **42 / 71% water / 7,045 gold** (1.11 years, was 6,552 gold); scholar **89 / 416.6** (0.77 years, was 76 / 107). All five kept water and safety above zero and produced no page or console error. The last pre-release gaps were 19 food (builder), 24 (diplomat), 445 gold (merchant), 12 residents (scholar) and 481 food (warlord); each is closed by the commissary, the final surplus sale or the war granary, not by global yield changes.

**Performance:** deterministic 100-year campaign `ok:true`, 40,040 ticks, final year 101, 13/13 ambitions, 3 eternal deeds, no game over, **2.556 ms/tick** against the pre-change **3.299** baseline (v3.12.0: 3.261; v3.13.0 sample: 2.534). The five browser journeys measured **2.226–2.485 ms/tick**. The only added cadence is one bounded `settleCrownSupply()` call per 100-day boundary while level IV is active.

**Compatibility:** `state.crownSupply` is now schema version 2; `lastGrainSeason` is additive and normalized to zero for older saves. Levels clamp to 0–4 and history to 24 entries. Saves without the field receive the zeroed structure and keep their existing well, farm, market and housing behaviour. The thirteen royal ambitions, their order and rewards, `allComplete` semantics and the eternal-deed state machine are unchanged.

**Verification:** focused crown-supply **11/11**; `npm test` **716/716**; syntax and relative imports for **104** source files / **189** UI ids; five independent 100-year browser journeys through the real start screen, management tabs, build menu, trade, diplomacy, military and research, each with desktop and narrow screenshots; campaign 40,040 ticks / 13/13 / 3 eternal deeds / **2.556 ms per tick**. Full record: [docs/CROWN_SUPPLY.md](docs/CROWN_SUPPLY.md).

### 3.13.0 — Crown Supply
**Released:** 2026-11-10
**Scope:** Three player decisions that break the late-game resource dead ends, plus the supply links that make them work: standing grain contracts, paid waterworks, stone housing, farm subsistence, garrison pay in kind and bounded partner restock.

**The three dead ends:** The five v3.12.0 journeys ended in the same self-reinforcing spiral from five directions. The warlord ended year 101 with 0 food and 1 soldier after white peace in year 71, because the garrison ate the granary and desertion ate the garrison. The merchant ended with 20 residents and 0 water coverage despite 7,646 gold, because wells need a staffed building and a legal tile, not coin. The builder and diplomat ended with 15–20 food. A shortage lowered immigration and morale, which lowered the labour that produced food, and a timber cottage's four places capped growth before the realm could grow out of it.

**Crown supply:** The economy panel now exposes three annual commitments. A grain contract (levels I–III: 120/240/420 food, raised by population) buys from open, non-war trade partners at 1.25/1.20/1.15 gold per food and always keeps `60 + 8 × soldiers` gold back for the garrison payroll. Paid waterworks (water carts, cistern network, aqueduct service) cover 40/65/90% of occupied homes for 18/36/58 gold a year, count exactly like a well in `updateServices`, and stop immediately when the payroll fails. A completed timber cottage can be rebuilt in stone for 55 gold (42 with a mason), raising capacity from 4 to 6 without a new footprint. Farms now book a direct subsistence share of their crop, so a farmed realm is not dependent on a spare carrier; a full granary settles 40% of the coin payroll in kind; and trade partners restock a bounded share of their starting stock so repeated purchases cannot drain every route forever.

**Journey results (year 101, through the real UI):** builder 43 → 60 residents and 15–20 → 140 food; warlord 28 → 46 residents, 0 → 55 food and 1 → 11 soldiers; diplomat 43 → 60 and 15–20 → 143 food, with four alliances; merchant 20 → 42, 0 → 71% water coverage, 7,646 → 6,552 gold and 200 trades; scholar 46 → 76 and 15–20 → 107 food with all 17 technologies. Every realm kept water and safety coverage above zero, finished with no game over, no page or console error and no horizontal overflow at 1600 px and 864 px. The five runs measured 2.412–2.504 ms/tick over roughly 40,000 ticks each.

**Performance:** The deterministic 100-year campaign is `ok:true`: 40,040 ticks, 13/13 ambitions, 3 eternal deeds, final year 101, no game over, **2.534 ms/tick** (baseline 3.261; the pre-change tree re-measured 3.299 on this host). Two hot paths were removed rather than measured around: `updateLogistics` rebuilt the full presentation snapshot (job/carrier/ledger copies plus ten physical-stock scans) every second tick although only the UI reads it, and the goods book re-filtered and re-sliced its 600-row ledger on every single booking.

**Compatibility:** `state.crownSupply` is additive and normalized on load; saves without it receive zeroed levels and keep the old well, farm and housing behaviour. Levels clamp to 0–3 and history to 24 entries. The thirteen royal ambitions, their order, rewards and `allComplete` semantics, and the eternal-deed state machine are unchanged.

**Verification:** focused crown-supply 6/6 including defaults, annual purchase, payroll reserve, partner restock, waterworks suspension and stone capacity; `npm test` 711/711; syntax and relative imports for 104 source files / 189 UI ids; five independent 100-year browser journeys with desktop and narrow screenshots; campaign 40,040 ticks / 13/13 / 3 eternal deeds / 2.534 ms per tick. Full record: [docs/CROWN_SUPPLY.md](docs/CROWN_SUPPLY.md).

### 3.12.0 — Crown Endeavours
**Released:** 2026-11-10
**Scope:** Five replayable post-ambition player paths, fifteen projects, twenty-four technologies and a new management tab.

**Content:** The five 100-year player journeys exposed the same late-game dead end from five directions: after the thirteenth ambition the realm had eternal deeds but no long-term project that joined the court, economy, army, diplomacy and research. Crown Endeavours adds the builder, warlord, diplomat, merchant and scholar paths. Each path has three named projects and five repeatable tiers (seventy-five completions in total), real resource costs, a named resident as overseer, Thrifty/Steady/Grand funding, annual progress and permanent modifiers to housing, health, morale, taxes, trade, research, military power, diplomacy, legitimacy and food demand. Projects unlock in sequence; a higher tier never invalidates an earlier one.

**Late research:** Eight late technologies (deep plough, seed banks, blast furnace, printing press, hospitals, vaccination, standing bureaucracy, great charter) extend the research tree from sixteen to twenty-four entries, so the scholar path still has discoveries after the old tree is complete. The late tree feeds the same research modifiers and save schema.

**War front and white peace:** The warlord journey exposed a hard late-war dead end: war was a treaty flag with no battle, food collapsed under the muster, and `SUE FOR PEACE` demanded food the realm no longer had, so a 70-year war produced 0 battles and 20 desertions. While a realm is at war, the annual military update now opens a bounded border front: at most one raid per year while no raid is active, two troll raiders near the keep, resolved by the existing named-garrison combat, wounds, losses and battle records. War exhaustion at 35 unlocks a white peace that costs no gold or food, so a losing war can always end; paid peace remains below the threshold. `lastWarRaidYear` is normalized for old saves. Warlord result: war declared year 31, 3 battles on the surviving roster (23–33 cumulative battle marks during the war), 9 losses, 15 desertions, white peace year 71, 28 residents, 44 buildings, 15 works, 2.909 ms/tick. Full record: [docs/WAR_FRONT_AND_WHITE_PEACE.md](docs/WAR_FRONT_AND_WHITE_PEACE.md).

**Compatibility:** `state.endeavours` is additive and normalized on load; saves without it receive empty paths, and malformed projects, funding or overseer ids are discarded. The thirteen royal ambitions, their ids, order, rewards and `allComplete` semantics are unchanged, as is the eternal-deed state machine. The management deck gains a nineteenth tab; the old eighteen tabs and all build, trade, faith, justice, military and diplomacy controls remain.

**Verification:** `npm test` 705/705; focused diplomacy/military/Endeavour/research 32/32 including the white-peace regression; syntax and relative imports for 103 source files / 189 UI ids; five independent 100-year browser journeys through the real start screen, management tabs, build menu, roads, trade, diplomacy, military and research, each with desktop 1600 px and narrow 864 px screenshots, no page or console errors and no horizontal overflow. Final realms: builder 43 residents / 37 buildings / 16 roads / 15 works; warlord 28 / 44 / 15 works / 3 battles / 9 losses / 15 desertions / white peace year 71; diplomat 43 / 36 / 15 works / 4 alliances at relation 100; merchant 20 / 34 / 15 works / 52 trades / 1,543 food / 7,646 gold; scholar 46 / 36 / 15 works / 17 technologies. Browser journeys measured 2.763–2.909 ms/tick. The deterministic 100-year campaign is `ok:true`, 40,040 ticks, 13/13 ambitions, 3.261 ms/tick (baseline 3.276), final year 101, 3 eternal deeds, no game over. Full record: [docs/CROWN_ENDEAVOURS.md](docs/CROWN_ENDEAVOURS.md) and [docs/WAR_FRONT_AND_WHITE_PEACE.md](docs/WAR_FRONT_AND_WHITE_PEACE.md).

### 3.11.0 — The Eternal Chronicle
**Released:** 2026-11-10
**Scope:** Repeatable eternal deeds after the thirteen royal ambitions, drawn from the live realm.

**Content:** The 50-year deterministic audit found the real long-term gap: after the thirteenth ambition the realm had no further goal and froze at 70/70 residents and 50 buildings. Fifteen eternal deed families now continue the same HUD card from live systems — population, housing, completed buildings, roads, treasury, granary, morale, household satisfaction, resolved issues, technology, alliances, prestige, garrison, places of faith and trade. Each deed fixes its target when issued, pays its resource reward and prestige exactly once, and immediately issues the next. A deed that makes no progress for three years is set aside without reward instead of blocking the chronicle, and extreme targets are withheld before the hard entity and map limits.

**Compatibility:** The thirteen royal ambitions, their ids, order, rewards and `allComplete` semantics are unchanged. `state.ambitions.eternal` is additive and normalized; saves without it load with defaults, and malformed deeds are discarded. The HUD keeps `13 / 13` and shows `ETERNAL DEED · N`, existing progress and `ETERNAL REWARD`.

**Verification:** focused ambitions 12/12; `npm test` 696/696; syntax/relative imports 101 source files / 189 UI ids; 50-year campaign 20,040 ticks, 13/13 ambitions, `ok:true`, 3.037 ms/tick, with two eternal deeds completed and three stalled deeds set aside across the run; browser 25-year campaign shows the eternal HUD at 1600/1024/864 px with no page or console errors. Full record: [docs/ETERNAL_DEEDS.md](docs/ETERNAL_DEEDS.md).

### 3.10.0 — The Living Realm
**Released:** 2026-11-10
**Scope:** Integrates the named population and households, realm founding, court and diplomacy, faith and justice, named military and public health, research and legacy, the PEOPLE panel, and the conifer/terrain reference updates.

**Fix:** The crown household now stays anchored to the keep, and pre-fix v3.10.0 saves with fractional royal coordinates normalize on load instead of being rejected.

**Verification:** `npm test` 687/687; syntax/relative imports 101 source files / 189 UI ids; Chromium E2E passed; conifer reference 12 formations + 4 seasons; 25-year campaign 10,040 ticks / 13/13 ambitions / 3.142 ms per tick.

### 3.10.0-dev — Living population, households and civic effects
**Status:** development branch only; not a production release.

- Added a persistent citizen register with name, age, sex, origin, household, profession/status, vocational talent, health, happiness, loyalty, faith, tradition, wealth share, profession history and civic events. Households store their residence, capacity, members, head, wealth, relations and annual history. The existing person profiles and entities remain the canonical identity; the register is an additive layer synchronized once per year.
- The annual census is deterministic (stable person-id order, no `Math.random`) and bounded to 420 citizens / 900 households. It records status, profession and health transitions, forms households for married partners when capacity allows, records births, maturation, ageing, illness and death from the existing annual systems, and allows one low-loyalty departure only in a starving, collapsing realm.
- The census entry point checks the stored census year before normalizing, so the annual event cannot become a per-tick deep copy; a focused assertion locks the no-op path to the live register object.
- Loyalty, employment, talent and health now feed bounded tax, building-output, legitimacy-pressure and soldier-quality modifiers through the existing economy, politics and military paths. The named garrison's talent drives military quality; the crown is classified as royal, never as a soldier.
- Save schema 7 carries the register additively. Absent, partial and malformed records are normalized and clamped, and an old save is populated from its live houses and residents on load without a crash.
- Added the 18th management tab, **PEOPLE**, with a population overview, eight filters, search, citizen cards, household details and recorded relationships. All tab-count contracts were updated from 17 to 18.
- Eight focused tests cover citizen persistence, deterministic annual census, partner household formation, talent-driven modifiers, royal/soldier classification, save/load round-trips, legacy-save normalization and removal of dead residents.

**Verification:** focused population 8/8; `npm test` 683/683; syntax/UI 101 files / 189 ids; 25-year campaign 10,040 ticks / 13/13 ambitions / no game over, with post-fix runs at **2.980, 3.016, 3.023, 3.025 and 3.073 ms/tick** (min 2.980, median 3.023, max 3.073; spread 0.093 ms). The median is **0.039 ms (1.3%) below** the 3.062 ms baseline, and the highest run is 0.011 ms (0.4%) above it, inside the observed spread. The pre-fix runs measured 3.132–3.215 ms/tick because the census entry point deep-normalized the register on every tick before its annual early return; the check now happens before normalization and a same-year no-op returns the live register. Preview and production both return HTTP 200 and serve byte-identical population modules; both environments are `published:true`. Full record: [docs/LIVING_POPULATION.md](docs/LIVING_POPULATION.md).

### 3.10.0-dev — Pointer steering, on-demand cards and portable terrain reports
**Status:** development branch only; not a production release.

- **Realm founding charter:** the start screen now defines a realm through its name, house, culture, religion, tradition, legal order, legitimacy doctrine, founding chronicle and starting charter. Five religions, five traditions, five legal orders and five legitimacy doctrines aggregate real tax, trade, research, military, food-demand, legitimacy and mortality modifiers through the existing culture path; the neutral defaults preserve old saves and deterministic balance. Six starting charters grant real wood, stone, gold, food, morale, legitimacy or research, and **oligarchy** plus **mixed constitution** join the government forms. The management GOVERNMENT panel exposes the charter. Old identities normalize additively without a save-schema bump, and the research cache now invalidates on every founding choice. Eight focused tests; full suite **675/675**; syntax/UI checks **99 files / 189 ids**; 25-year campaign **10,040 ticks / 13/13 / 37.6 s / 3.062 ms per tick**. See [docs/REALM_FOUNDING.md](docs/REALM_FOUNDING.md).

- **Faith, culture and justice:** two annual simulations now run from the live realm. Named clergy hold real convictions and competence; shrines and temples create congregation and clergy capacity; the culture budget, three festivals, funded pilgrimages and heresy tension spend real resources and change morale, legitimacy, tax reach, trade, mortality, military morale and migration. Named judges hold real competence and integrity; courts and prisons create judicial and prison capacity; crime emerges from inequality, hunger, war, quarantine and unemployment; five sentences, four legal codes, guild and town charters, and corrupt judges change the treasury, population, trade, migration and desertion. New building types 70 shrine, 71 court and 72 prison are fully buildable; the starting realm includes a completed shrine and court, while the prison remains a real decision. Both systems are annual, cache their modifiers and add no per-tick scans. Save schema 6 serializes, normalizes, validates and safely migrates both states; a loaded realm restores named office holders, charters, cases, sentences, festivals, pilgrimages, heresy and histories exactly. Two new FAITH and JUSTICE tabs expose every action, cost, person, statistic and history. Thirteen focused tests cover the systems; the full suite is 657/657, syntax/UI checks cover 96 files and 185 ids, the browser E2E builds both structures, appoints a cleric and judge, holds a festival, tries a case and round-trips save/load, and the 25-year campaign still completes 13/13 ambitions at 4.545–4.546 ms/tick.

- **Named garrison and public health:** barracks and stables now hold a named, trainable garrison rather than counters. Adult residents can be recruited into real guard entities, removed from the civilian workforce and drilled over 10–90 days under a named instructor; duration and success respond to season, marshal competence, food, morale, equipment, rank and war. Soldiers can be equipped, mounted on paid warhorses and demobilised; annual musters pay gold and food, consume stable pannage, record morale and desertion and keep a bounded history. Combat reads rank, equipment, morale, mount and wounds, and writes victories, wounds and permanent casualties back to the individual record. Health now connects sanitation, water, household and community transmission, per-resident immunity, named healers, medicine brewing/treatment/sale, 240-day quarantine with real market penalties, and annual mortality by age and occupation. The new **MILITARY** and **HEALTH** panels expose every action and the underlying people, costs, coverage, medicine and audit records. Save schema 5 adds and normalizes both domains. Eight focused tests cover recruitment, drill timing, equipment and horses, sanitation, healer coverage, medicine, quarantine market effects, mortality and save normalization. Full implementation and deployment record: [docs/MILITARY_AND_PUBLIC_HEALTH.md](docs/MILITARY_AND_PUBLIC_HEALTH.md).

- **Royal court and living diplomacy:** six named court offices with competence, loyalty and integrity derived from real resident traits, needs and the crown relationship; annual salaries, corruption, estate savings, resignations and vacancies; one faction petition per year with grant/ignore consequences; appointed envoys with skill, annual relation, trade-term and war-exhaustion effects. The court feeds economy taxes, health containment, combat readiness, market terms and diplomacy. The diplomacy panel shows envoys, war exhaustion and the new actions. Additive save fields are normalized; malformed court saves are rejected. Nine new tests cover appointments, audit, corruption, petitions, vacancies, envoys and save normalization.

- Completed the 1.2.2.29 forest sight-filter audit and production proof. One generation-scoped tile cache now serves every renderer sight query: buildings, figures, selection rings, construction and Forester overlays, all field layers, service/resource/fertility markers, logistics-route endpoints, the placement preview, particles, floaters and cached terrain fauna. The existing 100 ms entity/carrier caches remain; there is no per-frame DDA or per-item allocation for these gates. Roads, ground and the full-screen weather/daylight/vignette layers are terrain/atmosphere, not entity markers. `tests/browser/forest-occlusion.mjs` now proves a behind building, carrier, particle and floater are all absent while equal-distance open controls are present. Forcing the renderer filter to always-true fails the run on the behind entity; restoring the exact file passes again. Final checks: `npm test` 617/617, `npm run test:campaign` 25 years / 10,040 ticks / 13/13, conifer reference 12 formations + 4 seasons, occlusion green. Code commit `2b743e6c3dc5a2ffa4a48953e6eba2e2a07128de` was pushed to `ulmweb-branch` and Cloudflare Pages served it at https://kings-and-cards.pages.dev/; the live `renderer.js`, `terrain.js`, `CONIFER_FORESTS.md` and browser-test SHA-256 hashes match the commit. Live Chromium smoke: fresh realm seed `1547552200`, 21/22 population, 0/13 ambitions, 0 console errors.

- Closed the last two documented accessibility gates. A keyboard-first **Skip to game content** link is now the first focusable element; it is off-screen until focused, shows a 3 px ring, and Enter moves focus to `#main-container`. The dialog manager now applies `inert` plus `aria-hidden="true"` to every non-top body region, including nested settings, and restores each element's exact previous state on Escape or close. Production Chromium verification: the start dialog, settings cycle, focus trap, skip activation, 0 controls below 24 px, no horizontal overflow and 0 console errors all pass. The full Node suite is 612 tests.
- Added a living soil cycle to every farm. A completed harvest removes fertility (larger crops cost more), fallow and harvested ground recover slowly, an operational stable within six tiles adds manure recovery, and exhausted fields take a full fallow year instead of sowing. The building register shows soil percentage and resting state; legacy saves default the new values safely. Four focused tests cover depletion, rest years, manure and save round-trips; the full Node suite is 612 tests and the deterministic 25-year campaign still completes all 13 ambitions without a food collapse.

- Completed the conifer 1.2.2 audit pass. Every tree now derives its own height, trunk, crown and lean from a stable per-tree roll, so a stand is no longer one repeated silhouette. Wolves and lynx are real herds with local prey biomass, condition, predation pressure, migration and saves; crossbill, capercaillie, mouse and songbird joined the simulated community. Windthrow is now a live, weather- and exposure-weighted conifer disturbance alongside fire, bark beetle, snowbreak and drought. The renderer adds local snowdrifts, wet hollows and bog pools, wet-bark resin glints, spring needle tips, roots and shrubs on the conifer floor, treeline krummholz and weather-driven crown motion. The survey exposes species diversity (Simpson dominance), sight radius, wind exposure, wetness, deadwood and treeline; the same values feed the Lumber Yard/Forester site report. Focused coverage adds per-tree form, derived survey fields, real predator/prey herds and storm windthrow. The full Node suite is 605 tests.
- Added eight original local SVG house emblems. The sovereign dossier derives a stable crest from the dynasty name and uses the same emblem for current and former sovereigns, without external image requests.
- Added persistent contextual-tooltip, reduced-motion and high-contrast preferences. They are applied as presentation-only document modes, keep the existing local settings store, and do not change simulation state or save data.

- Proved the full 25-year Royal Ambition campaign with a deterministic scripted player in Node and Chromium. The run starts the shipped realm, builds through the real construction and road APIs, staffs and supplies the city through real carrier jobs, appoints an heir, resolves realm events and reaches all 13 ambitions at year 26 with 65 residents, 46 operational buildings, 3 mills, 3 bakeries, 4 farms, 2 towers and stable food/wood/gold/firewood. Headless: 10,040 ticks in 34.7 s, 3.53 ms/tick. Browser: 32.2 s, 2.729 ms/tick, 58 FPS / 17.3 ms frame at 1600×1000, no page or console errors. The fixes: hauls reserve at most one cartload and release the unpicked remainder, the starting lumber yard keeps its woodcutter, service coverage ignores empty cottages so expansion no longer silently closes the immigration gate, and the scripted player extends tower coverage as housing grows. `npm run test:campaign` and `npm run test:campaign:browser` keep the audit reproducible; the suite is 578/578.
- Added an in-game device benchmark in **Settings → Performance**. It measures the live realm through all three terrain renderer choices at 100, 85, 70 and 50 % render scale (12 configurations), samples only actually rendered frames (at least twenty per configuration), and reports FPS plus average main-thread draw time. The settings panel is hidden during the run so the result measures the game rather than the overlay; a compact progress bar stays visible and can be cancelled. The run temporarily uses a 60 FPS target and disables adaptive fallback for a fair comparison, and always restores the player's renderer, scale, frame limit, adaptive quality and overlay setting without saving changes.
- Performance and renderer options: automatic terrain detection now probes on a detached canvas, keeps software WebGL off the first frame, and otherwise uses WebGL on real GPUs. The Canvas path keeps the complete ground, grain, fog, shore detail and vegetation on a cached static terrain surface instead of re-rasterising them every frame; the surface is rebuilt only after camera, zoom, season, exploration or renderer changes. Added **Terrain renderer** (Auto/WebGL/Canvas 2D), a **60/30 FPS** cap, optional **Render scale** (100% default, 85/70/50% for weak devices), **Adaptive quality** and an optional **FPS / frame-time overlay**. While the Canvas view is being dragged, the cached detail layer follows the camera and only newly exposed strips use baked ground; the full layer is rebuilt when the view settles. No artwork, decorations or resolution levels were removed at the 100% default.
- Added the shared Laubwald ecology for 1.2.1: eight broadleaf species (oak, beech, birch, maple, chestnut, linden, elm, alder), fifteen formations including old-growth, alluvial, hillside, regenerating, fire, windthrow, disease and cut-over states, age classes from saplings to ancient giants, understorey/soil/deadwood layers, seasonal goods and deterministic wildlife herds with populations, carrying capacity, hunting pressure, migration and dispersal. Forest resource nodes, the Lumber Yard/Forester survey and the terrain renderer now read the same `forestStandAt()` model, so a displayed oakwood is the same wood the economy harvests. Added `forest-reference.png` (all fifteen formations) and `forest-seasons.png` (one ancient wood through four seasons), their JSON metadata, CI generation and the 60-point implementation audit in `docs/FOREST_ECOLOGY.md`. Fixed the signed per-tile tree roll that had made every forest stand render conifer silhouettes, so the broadleaf palette now actually renders as broadleaf in every season. A four-year, three-seed wildlife audit then calibrated winter mortality and reproduction, fixed the 400-day migration-period wrap and reserved split targets against same-day migration. The measured result is 132–148 herds at year end, 0.370–0.382 capacity fill, 41–76 migrations per year after settling, one herd per tile and no duplicate IDs; harvesting forest stock to 30 % lowers the stable population by 28.3 % without collapsing it. The new `forest-fauna-longrun.test.js` locks these invariants in.
- Simulated 100 years (40,000 days) of lumber harvest, player gathering and the real sliced regrowth together. Eight Lumber Yards plus four gathering sites every five days kept 85.1 % forest fill (lowest 85.0 %); yards alone held 91.8 %. A 40-yard/eight-site stress run ended at 60.1 % with 499 depleted tiles while regrowing more than it removed (917,977 vs 769,440), so the loss is local concentration rather than stock exhaustion. No balance change was required; the managed-plus-gathering century is now a regression test.
- Foresters now prioritise the most depleted stands in their five-tile range, scale planting with actual staffing efficiency and expose range stock, restorable tiles and their current stewardship action in the building register. The record now has a dedicated **Forest Stewardship** block with a live fill meter and status; selecting the lodge marks the restorable stands on the map (red bare, amber recovering, green nearly full) so regrowth is visible without developer tools. Player-driven planting and felling invalidate the cached woodland raster at visible stock stages instead of leaving an old canopy on screen. A dedicated Playwright audit (`npm run test:forester-stewardship`) starts a real realm, verifies the rendered values over multiple ticks and captures before/progress/after screenshots and JSON evidence. The catalogue's zero-batch forest recipe no longer runs a fake harvest that could overwrite the Forester's status.
- Extended the Forester stewardship audit to ten game years across three seeds and rotating harvest pressure. The browser run now covers seeds `20261108`, `7` and `99` for 30 years (12,000 days): a fresh cut of one to three stands each year, two to four stands thinned every twenty days, and an annual clear-cut on a rotating day between 80 and 140. Across the run 14,256 stock was removed against 13,473 saplings planted; every year ended at full stock (6,975/6,975, 9,857/9,857 and 11,969/11,969), 0 restorable stands and `Forest is fully grown`. The range never fell below 95.8 % and never showed `Forest stand is depleted` or `Waiting for planting space`. Each cut frame carried exactly its scheduled one to three red markers, all recovered frames carried none, and the yearly stewardship DOM matched the live simulation. The three-seed browser run completes in 162.7 s against an explicit 240 s budget. The deterministic `tests/systems/forester-stewardship-longrun.test.js` locks in three seeds × ten years (12,000 days) with variable clear-cut sizes and days, annual harvest variation and visual-revision checks (`npm test` **572/572**); `npm run test:forester-stewardship-longrun` writes the production-style browser evidence to `docs/forester-stewardship-longrun/`. The browser CI workflow now runs the same audit after a successful Chromium E2E step, enforces the 240 s budget, and uploads the JSON report, screenshots and log as the `kings-and-cards-forester-stewardship-longrun` artifact. The report is written before the budget assertion, so a run that overshoots still uploads its measured duration and per-seed evidence.
- Extended the intensive 40-yard/eight-site case to 200 years. The original seed went from 60.06 % forest fill at year 100 to 59.93 % at year 200; two further seeds ended at 62.32 % and 60.59 %. All three stayed in a 60–62 % band with no failed harvesting actions, so the pressure thins the wood to a stable working range instead of triggering a long-term collapse.
- Deepened the Laubwald ecology with coupled soil, moisture, morning mist and one shared solar vector, grouped herds with movement and visible tracks, browse, carcasses, nests and territory marks, eight species-specific timbers plus new seasonal understory goods and leaf silhouettes, and fire/windthrow/disease spread every 12 days with a paid 90-day containment action. A 40-year, two-seed audit found the active disturbance share stable at 6.6–9.9 % (peak in year one) with 96 % forest fill, so the spread rates stay unchanged. The audit also exposed that `regrowForests` was never called by the simulation: regrowth now runs as a 400-day cycle in 400 daily slices, preserving the one-stock-per-25-days average while a half-depleted 576 × 576 realm costs ~2.3 ms median per slice instead of ~800 ms for a full pass. Without regrowth the same audit lost 35 % of forest stock by year 40.
- Seasonal overhaul: fixed snow in summer. Weather now follows a season-aware table and spells last 3–12 days instead of 280–1100; a snowfall is reconciled to rain as soon as the snow-cover curve reaches zero, and old saves are clamped on load. The ground uses one continuous calendar with asymmetric snow (accumulates through late autumn, peaks in winter, melts through early spring) and leaf-litter/green-up curves; palette colours and sun elevation are anchored mid-season so a season reaches full colour in its middle instead of on its first day. Trees and shrubs now turn and drop per tree and species: birch is early, oaks and beeches keep brown leaves into winter, conifers stay green under snow, and bare crowns draw real branches instead of a grey ball.
- Added five climate profiles (`temperate`, `northern`, `mediterranean`, `arid`, `enchanted`) that shift the same continuous snow and foliage curves instead of forking them: northern snow arrives earlier and melts later, mediterranean and arid winters hold less snow, and per-species snow retention keeps conifer loads while birches shed early. The temperate profile remains the baseline. A full-year browser audit now simulates 400 days with the real seeded weather stream, records each day's weather and six species' foliage in `docs/terrain-reference/season-year.json`, and fails on summer snow, bare conifers or missing oak marcescence. The contact sheet, `season-transition.png`, `tree-seasons.png` and that log are uploaded together as the CI terrain artifact; the suite is now 512 tests.
- Added a climate reference that holds the same generated world, seed, grove tile and 2.40× camera while switching only the climate profile: `docs/terrain-reference/climate-reference.png` shows all five climates at days 250, 280, 310 and 50, and `climate-reference.json` records the measured ground and per-species state. A live check runs five separate realms through 400 real `updateWeather()` days each, writes five 1280 × 800 day-330 screenshots plus `climate-live.png` and `climate-live.json`, and fails on summer snow, too few weather changes, missing oak marcescence, a northern realm that is not snowier than an arid one, or conifers that do not retain more snow than birches at day 30. Bare crowns now use a tapered trunk, five to seven primary limbs, twigs and snow on the branch tips; marcescent crowns also draw the branch silhouette over the remaining leaves. Conifers use four needle tiers with snow accumulated and shed per tier plus clumps on the outer tips. The unit-test count remains 501 because this round adds visual and integration coverage, not new unit tests.

- Map panning uses pointer capture, so a drag continues across the canvas edge and over HUD plaques instead of stopping at the first overlay. Gameplay keyboard bindings were removed; Escape still cancels drags and closes dialog panels.
- Removed the permanent five-slot card hotbar. Cards are drawn one at a time from the Cards panel, only when the player presses **Draw random card**; nothing is dealt on a timer and no card is selected automatically.
- A map click no longer places a card. Placement is drag-only, from the Selected Card inspector onto a validated tile. After placing or discarding a card, no replacement is armed.
- The obsolete **Card draw pace** setting was removed with the automatic draw loop.
- Added **Download JSON** to the terrain benchmark page (and `?json=1` for an automatic download). The report contains renderer, WebGL version, viewport, user agent, device pixel ratio, capture time and draw/frame medians and p95 for all four zoom levels.
- Touch gestures no longer leak a map click: a two-finger pinch is marked as a gesture, so lifting the fingers cannot open a construction site or attack. Pinch zoom now follows the finger-distance ratio instead of the wheel-delta factor, and `touchcancel` clears stale pan and pinch anchors.
- Terrain detail art pass: the deterministic atlas now ships 256 px tiles with four seamless variants for grass, forest, rock, sand, snow, earth and wetland (8 MiB, uploaded once per context). The shader cross-fades neighbouring variants and uses the red, green and blue channels for relief, macro contrast and fine crust instead of sampling only red. A 1440×900 Chromium run compiled the shader without warnings, uploaded the 2048×1024 atlas and rendered zoom 1 and 2.4 views without page or console errors; the software renderer cannot stand in for a real-GPU quality check.
- Added a committed terrain visual reference: a reproducible Playwright capture of all four seasons at all four zoom presets, written to `docs/terrain-reference/contact-sheet.png` with metadata and a regeneration guide. The browser CI workflow generates the same reference into a temporary directory and uploads the contact sheet and metadata as an artifact, including when the gameplay E2E step fails.
- Completed the terrain checklist 1.1 audit: fixed shoreline distances to scale with each world's 2–5 samples per tile, wired the previously computed arid weight into the sand material, added a noise-broken coastal sand fringe and close-view water-crest highlights. Added three shore-distance regression tests and two shader-path contracts; the full suite is now 476 tests.
- Updated unit and browser contracts for the new flow: `npm test` passes 471 tests; a focused Chromium run verified a 90/40 px pointer drag, five on-demand draws, no auto-selection, drag placement, blocked map-click placement and the JSON download with four measured levels. A touch-emulated 412×915 Chromium run verified a 60/30 px one-finger pan, a 2.5× pinch from an 80 px finger spread, no click after a pinch, and a still-working deliberate tap.

### 3.9.0 — The Living City: construction, logistics and production
**Released:** 2026-11-06
**Scope:** City-builder foundation. New structures are construction sites; physical carriers move goods between producers, consumers and warehouses; seasonal farms and managed forests supply the realm.

- Added construction sites with staged material deliveries, staffing and cancellation.
- Added local inventories, bounded warehouses, haul and supply reservations, and visible carriers.
- Added grain → flour → bread, logs → planks and firewood, stone → cut stone, and well-water chains. Bread becomes royal food only after warehouse arrival.
- Added seasonal field states, forest stewardship, housing tiers, settlement needs and service coverage.
- Added city HUD and construction panels plus save schema 4 with backward-compatible normalization.
- Added a five-year full-city test with 26 buildings, 43 workers and three parallel material chains, plus a focused grain-to-bread chain test.

**Verification:** `cd game && npm test` — 363 tests pass; the syntax/import check passes for 69 source files and 159 referenced UI ids. Chromium browser E2E was not completed in this cloud session because the Playwright headless-shell package could not be installed within the command limit; the production push triggers the repository Game Quality workflow.

### 3.8.0 — HUD 3.8: The Throne Room
**Released:** 2026-11-05  
**Scope:** Presentation only. No simulation rules, save schema, card values or economy balance were changed.

- Replaced the mixed prototype header with a two-row royal banner: identity plate, realm calendar, morale, player seal, a five-resource ledger with live per-tick deltas and a full-width command bar.
- Widened the administration rail to 96 px so every label is fully readable, added a DOMAIN divider and allowed the rail to scroll on short screens.
- Framed the world stage with a grain/vignette layer and a compass ornament, removed the duplicated canvas zoom chip and kept the real HTML zoom controls.
- Rebuilt the hand as five explicit slots with numbered empty states. The 820 px dock no longer collides with the minimap, which is now anchored above it.
- The card inspector has an honest empty state instead of a PLAY ribbon over an empty frame, and the selected card uses the royal card atlas rather than an emoji.
- Resource chips and store cards show rounded live income deltas; raw floating-point values no longer leak into the HUD.
- `.hidden` is now a global contract, so the EXIT BUILD control no longer remains visible outside construction mode.
- The founding screen becomes a two-column illuminated plate at desktop sizes, so the World Forge and every action fit without inner scrolling.
- Terrain prerendering gains north-west hillshade, coastal lightening, water depth tone and broad mottling. Grass tufts and flowers are jittered and translucent instead of repeated glyphs.
- Every building type has a distinguishable rooftop silhouette, with a dedicated castle plan for the keep, a stone cross plan for the temple and animated mill sails.
- Added `tests/ui/hud-v3.test.js` with twelve static contracts and repaired the resource-flow formatter that produced raw floating-point strings.

**Verification:** `cd game && npm test` — 279 tests pass; the syntax/import check passes for 56 source files and 99 referenced UI ids. Browser geometry checked at 390×844, 900×1000, 1440×900 and 1920×1080: no horizontal overflow, no topbar group overlap, no clipped hand cards, no minimap/hand collision, five hand slots in every state, and no console errors during a live simulation run.

**Scope limit:** This is a presentation layer. It does not add management screens, cloud accounts, autosave or new simulation systems. The legacy stylesheets remain loaded beneath the HUD layer for backward compatibility.

### 3.7.0 — Master UI Phase 2 completion: sovereign dossier and connected lineage
**Released:** 2026-11-05  
**PRs:** [#80 — Sovereign dossier](https://github.com/Dulle1846/ulmweb/pull/80), [#84 — Connected lineage network](https://github.com/Dulle1846/ulmweb/pull/84)  
**Production merge commit:** `5f980cc656a0308db0b5ba6d664a615d4bca1bef`  
**Sovereign feature head:** `edf49e7fc7feda632410941859fb447941055301`  
**Lineage feature head:** `cedf972fdc95e55011bf169ec019156d15d4633a`  
**CI:** Game Quality, Kings & Cards 2.1 checks and Chromium gameplay E2E passed on the exact feature heads. The separate Workers build check failed; it is not the Cloudflare Pages deployment and was not used as Pages release evidence.  
**Cloudflare Pages smoke verification:** The official `kings-and-cards.pages.dev` homepage loaded, and the newly released `css/sovereign-dossier.css`, `js/presentation/character-dossier.js` and `css/dynasty-network.css` assets were fetched successfully from that Pages domain. The exact Pages deployment ID was not available in the GitHub evidence inspected here.

- Added a dedicated current-sovereign dossier backed by the royal-house model: consort, designated heir, living royal children and bounded royal-house chronicle.
- Former sovereign memorials are separated from the current ruler's live succession information.
- Added direct navigation from royal relatives into the canonical character dossier.
- Replaced disconnected dynasty relative groups with a connected, multi-lane graph for recorded grandparents, parents, sovereign, siblings, consort, aunts/uncles, cousins and children.
- Added SVG relationship connectors with distinct parent, guardian, partnership and sibling styles.
- Added hard rendering bounds of 80 lineage nodes and 120 edges, while retaining the existing descendant depth and per-generation limits.
- Added responsive styling, reduced-motion behavior, static UI contracts and deterministic Chromium coverage for the sovereign dossier and graph-to-dossier hand-off.
- No simulation rules or save schema were changed.

**Scope limit:** The lineage graph only displays recorded kinship links; it does not invent unknown relatives. This completes the current Phase 2 sovereign dossier and connected lineage increments, not the entire Master UI concept. Remaining work includes broader family graph interaction, complete character action workflows, screen-by-screen responsive/contrast/screen-reader audits, and the full art/animation pass.

## Production release history

### 3.6.0 — Master UI Phase 3: Economy, buildings, creatures and chronicle
**Released:** 2026-11-05  
**PR:** [#43](https://github.com/Dulle1846/ulmweb/pull/43)  
**Merge commit:** `ad4d3c9978779aa7cc4921ec43a934d1b8338b38`  
**Tested feature head:** `63ec3957697f4513ddeefd9ad5c5889689a0ceb7`  
**CI:** Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E all passed on the exact feature head.  
**Cloudflare Pages:** Successful deployment check for production-branch commit `09c2d747f08216199154af480735eeae064d0e9b`; deployment ID `35e2a522-431d-4558-8195-06a24bb4dc2d`; [deployment preview](https://35e2a522.kings-and-cards.pages.dev/).

- Added a data-backed economy view separating resource stock, current-tick flows, the latest 20-day settlement and cumulative totals.
- Added a searchable building register with actual entity health, footprint, staff, workforce efficiency, catalogue cost and centre-tile resource data.
- Added individual living-dragon dossiers and memorial records with needs, bond, life stage, abilities, goals and memories.
- Added a searchable event inbox and chronicle with category filters, stored tick references and a dismiss/reopen flow for unresolved issues.
- Added browser coverage for the new panels, creature dossier, chronicle search and active-issue dismissal/reopening.

**Scope limit:** The simulation currently retains only the latest completed financial ledger, not a historical time series. Per-building production, storage and upkeep are not exposed. No trend charts or forecasts are fabricated. Chronicle history remains limited to the stored event log (up to 100 recent records); unread tracking and permanent external archives are not claimed. The initial seven-viewport screenshot matrix for the realm shell and management dialog was completed in Phase 5 (PR #66); full overlay-by-overlay responsive QA and the remaining original art atlas work remain outstanding. No simulation rules or save schema were changed.

**Release status:** Production branch `ulmweb-branch` contains version `3.6.0`; the Cloudflare Pages deployment check for the latest production-branch commit `09c2d74` completed successfully on 2026-11-05. The check exposes the deployment preview URL above. The canonical user-facing address remains https://kings-and-cards.pages.dev/.

## Production release history

### 3.5.0 — Master UI Phase 2: Dynasty and contextual actions
**Released:** 2026-11-05  
**PR:** [#40](https://github.com/Dulle1846/ulmweb/pull/40)  
**Merge commit:** `f47da8ecfd564ecf3edcd5913607407348e4aad6`  
**Tested feature head:** `e7f59bb3df9ae5961a2be65872f43e04978dd10a`  
**CI:** Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E all passed on the exact feature head.

- Added the contextual management action dock for people, dynasty, cards, chronicle and manual save.
- Added a bounded multi-generation descendant tree sourced from saved kinship relationships, with direct links into the existing character dossier.
- Added save/load status feedback that only reports confirmed operation outcomes; no autosave is claimed.
- Added reusable parchment cards, dark panels, section headings, icon-button styles, tooltip surfaces and dynasty person cards.
- Added static contract tests and browser coverage for dynasty navigation, dossier hand-off, manual save and chronicle navigation.

**Scope limit:** The dynasty tree currently presents the sovereign's descendants with a depth and node cap; it is not yet a complete ancestor/sibling graph. The action dock is a contextual sidebar dock, not the final full-width lower action bar. The dedicated event inbox, autosave, full responsive viewport matrix and remaining UI concept screens are still outstanding. No simulation rules or save schema were changed.

### 3.4.1 — Master UI foundation
**Released:** 2026-11-05  
**PRs:** [#36](https://github.com/Dulle1846/ulmweb/pull/36), [#37](https://github.com/Dulle1846/ulmweb/pull/37)  
**Merge commits:** `b040adf7870678132f699a7a7889b3b556aa1307`, `e9efbcf60950e3b596b7b8670fccb2f4b47eee8b`  
**Pages deployment check:** successful on `e9efbcf`; [deployment preview](https://68e0b527.kings-and-cards.pages.dev/)

- Added the royal parchment/dark timber design-token system and shared component styling.
- Added the left royal administration rail and functional links to kingdom, government, people, dynasty, politics, economy, cards, creatures, building and settings screens.
- Added live top status indicators for resources and population.
- Added a data-backed kingdom overview for sovereign, year, population, morale, treasury, housing, workforce, legitimacy, resource stores and recent records.
- Reused the existing heraldic crest and SVG resource artwork in place of several placeholder glyphs.
- Added accessible selected navigation states and UI contract/browser tests.
- Follow-up guard now shows neutral values before a campaign starts and an explicit awaiting-founding state rather than misleading placeholder metrics.

**Scope limit:** This is the first UI foundation, not completion of the full Master UI concept. The remaining screens, asset suite, lower action dock, dynasty tree, building/resource dossiers, chronicle, event inbox and viewport matrix remain in development.


### 3.4.0 — Resource geography foundation
**Released:** 2026-11-05  
**PR:** [#34](https://github.com/Dulle1846/ulmweb/pull/34)  
**Merge commit:** `bffeb1afb82da9c51c622a0a6a0ed8006560c74b`  
**Feature head:** `b374d77dd565e2cfeab0a421d55f10940e43b00e`

- Deterministic resource geography generated from the world seed and terrain.
- Compact typed arrays for forest stock/capacity, stone stock/capacity, fertility and water access.
- Bounded forest and stone extraction primitives; stock cannot become negative.
- Capacity-limited forest regrowth.
- Sparse save deltas for depleted nodes, validation and legacy-save fallback.
- Unit coverage for determinism, deposits, water, fertility, search, extraction, regrowth and save round-trip.
- Browser E2E coverage for resource depletion across save/load.

**Explicitly not included in 3.4.0:** resource overlays, building-to-node extraction integration, warehouses, physical hauling and complete production chains. The resource model is a foundation, not yet a fully connected economy.

**Verification recorded:** Game Quality and Kings & Cards 2.1 checks succeeded on merge commit `bffeb1a`. Game Browser E2E succeeded on the exact PR feature head `b374d77`; it was not re-run on the merge commit in the recorded workflow set.

### 3.3.0 — Roads and settlement infrastructure
**Released:** 2026-11-05  
**PR:** [#27](https://github.com/Dulle1846/ulmweb/pull/27)  
**Merge commit:** `fe248e694b50477136f3cdb3a182466788fe1c32`  
**Tested feature head:** `5dba0ab974826fab3fd515639bc66ffa800928ba`

- Dirt, gravel and paved roads, with costs, upgrades and demolition refunds.
- Click/drag placement, explicit build-mode exit, rendering and intersections.
- Road-quality-aware movement and A* route costs.
- Road upkeep included in the economy ledger.
- Save/load and browser E2E coverage for road placement and persistence.

**Verification recorded:** Game Quality, Game Browser E2E and Kings & Cards 2.1 checks succeeded on the exact tested feature head.

### 3.3 documentation and release operations
**Merged:** 2026-11-05  
- PR #28 added studio operations, AI review guidance and roadmap documentation through 4.0.
- PR #33 updated the post-release audit and handed off the next phase to resource geography.
- These were documentation/operations merges, not separate player-facing game versions.

## Historical development lines and PR disposition

The following entries preserve the recorded development history. **They are not all production releases.** Their status is shown explicitly so that a feature branch is never mistaken for shipped content.

| Version line | Recorded work | GitHub record | Status at 2026-11-05 |
|---|---|---|---|
| 2.1 | Stability, performance, economy and living-world foundations | [PR #6](https://github.com/Dulle1846/ulmweb/pull/6) | Merged into `ulmweb-branch` |
| 2.2 | Seeded/deterministic simulation foundation | [PR #7](https://github.com/Dulle1846/ulmweb/pull/7) | Merged into 2.1 development branch; not a direct production merge |
| 2.3 | Event-linked personal chronicles | [PR #8](https://github.com/Dulle1846/ulmweb/pull/8) | Open |
| 2.4 | Species-aware life cycles | [PR #9](https://github.com/Dulle1846/ulmweb/pull/9) | Open |
| 2.5 | Explicit family and kinship graph | [PR #10](https://github.com/Dulle1846/ulmweb/pull/10) | Open, draft |
| 2.6 | Character dossiers and lifecycle aggregation | [PR #11](https://github.com/Dulle1846/ulmweb/pull/11) | Open, draft |
| 2.7 | Birth cooldown and family-save normalization | [PR #12](https://github.com/Dulle1846/ulmweb/pull/12) | Closed without merge |
| 2.8 | Explicit orphan guardianship | [PR #13](https://github.com/Dulle1846/ulmweb/pull/13) | Closed without merge |
| 2.9 | Royal dynasty / court / strategy UI | [PR #14](https://github.com/Dulle1846/ulmweb/pull/14), [#16](https://github.com/Dulle1846/ulmweb/pull/16), [#19](https://github.com/Dulle1846/ulmweb/pull/19) | Open drafts; overlapping lines |
| 3.0 | Government, politics, economy and card management UI | [PR #17](https://github.com/Dulle1846/ulmweb/pull/17) | Open draft |
| 3.1 | Persistent creatures / dragon lifecycle and dynasty strategy UI | [PR #18](https://github.com/Dulle1846/ulmweb/pull/18), [#20](https://github.com/Dulle1846/ulmweb/pull/20) | Open drafts |
| 3.2 | Deterministic combat retaliation | [PR #22](https://github.com/Dulle1846/ulmweb/pull/22) | Closed without merge |
| 3.3 | Roads and settlement infrastructure | [PR #27](https://github.com/Dulle1846/ulmweb/pull/27) | Production release |
| 3.4 | Deterministic resource geography | [PR #34](https://github.com/Dulle1846/ulmweb/pull/34) | Production release |

### Important branch-consolidation warning

Open, closed-unmerged and stacked PRs must not be merged mechanically. Several are based on other feature branches rather than the production branch, and some overlap. Their unique code, assets, tests and save migrations must be compared against the current production tree before selective porting. Keep source branches until a preservation matrix proves that no unique work is lost.

## 3.5.0-dev — Long-run playability and economic integration
**Development branch:** `kac-3.5-long-run-audit-and-ledger`

Planned scope:
- Reproducible multi-year campaign tests, including a 25-year simulation run.
- Long-run invariants for resources, population, entity counts, positions, morale and deterministic outcomes.
- Connect finite resource geography to actual lumber and quarry production.
- Add resource overlays and clear site-suitability feedback.
- Design and test storage reservations and physical hauling before adding more production chains.
- Review victory/game-over pacing and ensure sandbox play remains meaningful after the first milestone.
- Audit save/load compatibility and bounded memory/log/archive growth.
- Add a measured browser soak-test and performance budgets.

This line is not a production release until all release gates pass.

## Release checklist

Every release entry must record:
1. Version and date.
2. Production branch and exact merge commit.
3. PR and exact tested head.
4. Unit/integration and browser E2E results.
5. Save migration and backward-compatibility results.
6. Performance and long-run simulation results.
7. Cloudflare Pages deployment ID/status and the deployed commit.
8. Known limitations and explicit non-goals.

Never describe an unverified feature as implemented or a successful CI run as a successful deployment.


## Development line 3.7.0-dev — Master UI Phase 4 art production

### Portrait and illustrated-register increment
- Added a seven-archetype original heraldic portrait sprite library in `game/assets/royal-portraits.svg`.
- Integrated portraits into the people roster, character dossiers and dynasty cards.
- Added direct navigation through recorded family/relationship links, plus verified sovereign parents, siblings and cousins in the dynasty view.
- Added existing local building illustrations to each building-register entry.
- Added static UI contracts and Chromium E2E assertions for portrait assets, relationship navigation and building artwork.

**Scope limit:** This is the first portrait/art integration slice. It does not complete the requested building, creature, card, heraldry or animation atlas. No simulation logic or save schema is changed.


## Development line 3.7.0-dev — Master UI Phase 5 accessibility increment

- Centralized dialog focus handling with topmost-modal tracking, Tab/Shift+Tab containment and focus restoration/fallback.
- Added accessible dialog semantics and labels to the founding and settings screens.
- Added modal scroll containment and narrow/short viewport overflow rules.
- Added static modal-contract tests and Chromium E2E assertions for focus behavior.

**Scope limit:** This is not a full accessibility certification. Screen-reader testing, keyboard audit of every control, color-contrast audit and the complete viewport matrix remain open.


## Development line 3.7.0-dev — Phase 2 full-width action bar

- Promoted the contextual action dock from the right sidebar to a full-width lower bar beneath the game layout.
- Preserved the existing live action handlers and save-status semantics.
- Added responsive wrapping and E2E viewport checks at 390×844, 768×1024, 1280×720, 1366×768, 1600×900, 1920×1080 and 2560×1440.


## Development line 3.7.0-dev — Phase 4 building and title art

- Added 15 dedicated original SVG building symbols mapped to the current building type enum.
- Replaced the bright storybook title image with an original muted royal dusk panorama aligned to the parchment, timber and antique-gold direction.
- Added asset-contract and browser assertions for the title artwork and building atlas mapping.


## Development line 3.7.0-dev — Phase 4 card illustration

- Added original category artwork for the current card-group families and mapped the existing card group sprite identifiers to the new atlas.
- Replaced emoji duplication with a single scalable category illustration per card.
- Added an original parchment / antique-gold card frame and rarity treatments.
- Added static asset contracts and browser assertions; card rules, generation and save schema are unchanged.


## Development line 3.7.0-dev — Phase 4 dragon life-stage art

- Added five original dragon SVG illustrations for the simulation's persisted hatchling, juvenile, adult, elder and ancient life stages.
- Integrated stage-matched portraits into living dragon dossiers and memorial records.
- Added static asset contracts and browser assertions. No creature simulation or save data changed.


## Development line 3.7.0-dev — Phase 2 reusable control primitives

- Added shared primary, secondary, tab and icon button variants with consistent focus, hover, pressed, selected, disabled and reduced-motion states.
- Added reusable panel/header primitives and keyboard-accessible tooltip styling.
- Applied the primitives to founding actions, modal close controls, management tabs, panels and the full-width action bar.
- Added static and Chromium E2E contracts. Full legacy-control migration and a complete windowing API remain open.


## Development line 3.7.0-dev — Phase 2 reusable window primitives

- Added compact founding, small, medium and large reusable window presets.
- Added shared header/body/footer regions with controlled scrolling and short/narrow viewport bounds.
- Applied the primitives to settings, people dossiers, management, construction, event dialogs and the founding screen.
- Added static and Chromium E2E contracts. Drag/resize and final overlay stacking remain outstanding.


## Development line 3.7.0-dev — Phase 2 character roster filters

- Added living/deceased, role and species filters to the character roster.
- Role/species options are generated from actual persisted character records.
- Added responsive filter styling and static/browser regression coverage.


## Development line 3.7.0-dev — Phase 5 navigation accessibility correction

- Replaced misleading toggle semantics on the active administration navigation item with `aria-current="page"`.
- Added static contracts for all twelve navigation destinations and a browser test for keyboard activation of the live Economy screen.
- Full keyboard, screen-reader, contrast and visual viewport audits remain open.


## Development line 3.7.0-dev — Phase 5 viewport screenshot evidence

- Chromium now captures the realm and management dialog at all seven required responsive viewports.
- GitHub Actions uploads the screenshot set as a seven-day review artifact, including on failed runs where screenshots exist.
- This enables visual QA but does not itself certify the layout or complete the remaining accessibility audit.


## Development line 3.7.0-dev — Phase 5 responsive header correction

- Wrapped the global action controls onto a dedicated row at intermediate desktop widths and below the resource strip on narrow screens.
- Added Chromium checks for header overflow, overlap between header groups and clipped action buttons at all seven responsive viewports.
- Visual review also logged remaining art-direction work: world map/building presentation still contains simple placeholder-like shapes; this fix does not claim to complete world art.


## Development line 3.7.0-dev — Phase 5 mobile panel scroll

- Added contained vertical scrolling to the mobile management column so the card panel and lower tabs remain reachable on short screens.
- Added Chromium regression checks for actual scroll range and scroll movement at 390×844 and 768×1024.


## Development line 3.7.0-dev — Phase 5 merged responsive corrections

- PR #69 merged as `e4d343041ec6960502c471aa5efd2ca0994f85f5`; all three required workflows passed and the seven-viewport screenshot artifact was reviewed.
- PR #70 merged as `09c2d747f08216199154af480735eeae064d0e9b`; all three required workflows passed, including real mobile side-panel scroll checks at 390×844 and 768×1024.
- These are code merges to the production branch, not an assertion that Cloudflare Pages has already finished publishing them. Pages delivery remains a separate release gate.


## Development line 3.7.0-dev — Phase 5 mobile dock clearance

- Reserved 44px of bottom scroll space on narrow phone layouts to compensate for the action dock overlapping the side-panel's lower edge.
- Added a viewport-aware E2E assertion that the selected card is fully visible above the dock, with a real scroll only when the card starts obscured.
- Added scrolled-state screenshot evidence at 390×844 and 768×1024; no simulation or save data changed.


## Development line 3.7.0-dev — Phase 5 selected-card reachability evidence

- Added an end-to-end proof that the selected card can be brought fully into view within the mobile management panel at 390×844 and 768×1024. The test requires a scroll only when the card is initially obscured and a meaningful scroll range exists; if the card already fits, no artificial scroll is demanded. It also checks that the card is not covered by the bottom action dock.
- Browser CI also uploads dedicated scrolled-state screenshots for visual review; no game state or save data is changed.


### Mobile viewport follow-up

- Added 44px bottom scroll clearance at narrow phone widths because the bottom action dock covers part of the side-panel's theoretical lower edge.
- The browser assertion now positions the selected card above the dock's top edge, preventing a false pass where the card was inside the panel but still visually obscured.


## Development line 3.7.0-dev — sovereign dossier increment

- Added a dedicated royal-house section to the living sovereign's existing character dossier, backed by the authoritative royal-house model.
- Displays the currently recorded consort, designated heir, living royal children and bounded royal-house chronicle; related people reuse the existing dossier navigation.
- Former sovereign memorials are explicitly separated from the current monarch's live succession state.
- Added local responsive parchment/timber styling and static contracts for data provenance, navigation and bounded rendering.
- No simulation rules, entity records or save schema changed. Browser E2E for sovereign-to-heir navigation remains a merge gate.


## Development line 3.7.0-dev — connected royal lineage network

- Added a multi-lane family graph using verified kinship records for grandparents, parents, sovereign, siblings, consort, collateral relatives, cousins and royal children.
- Added live SVG connector paths with distinct parent, guardian, partnership and sibling styles, plus canonical person dossier navigation.
- Enforced 80-node and 120-edge limits; retained the existing descendant depth and per-generation caps.
- Added deterministic Chromium coverage for relationship paths and heir dossier navigation, with reduced-motion and responsive styling.
