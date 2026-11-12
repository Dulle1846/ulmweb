# Living events, the chronicle timeline and centre notices

**Status:** implemented and verified on the current runtime build. Save schema **11**.
**Runtime:** `js/systems/micro-events.js`, `js/core/event-timeline.js`,
`js/presentation/event-timeline-panel.js`, `js/presentation/event-notifications.js`.

## What is recorded

The living archive has two producers and one durable store:

1. **Procedural small events** — the weighted catalogue below. These are the
   tiny incidents (a knight catching a spur, a dragon crossing a village, a
   market bargain, a raven on the gate) that make the realm feel inhabited.
2. **Existing world events** — every non-`system` call to `addLog` (births,
   deaths, raids, succession, decisions, discoveries, health and so on) is
   bridged into the same timeline with a category and severity. The short HUD
   log remains capped at 100; the timeline is the larger record.
3. **Transient presentation** — centre notices for procedural micro-events are
   not saved. Existing world events are archived without a popup. The timeline
   is authoritative and can be reopened after a reload.

Every event records its real **tick, year, day, place, named participants and
material impact**. There are no placeholder dates or invented people.

## Cadence

- The first micro-event is due **2–6 in-game days** after the realm starts.
- After that, the next event is due **2–5 in-game days** later.
- With 400 days per year this averages roughly **100–115 micro-events/year** at
  normal speed. At 4× the clock produces them faster in real time, not more per
  in-game day.
- The first 2,400 retained pages are kept. Older pages are pruned; the
  generated counter keeps the lifetime total.
- The engine creates at most one micro-event per due day. Existing world events
  are added as they occur.

This is a deliberately bounded rate: it is frequent enough to feel alive and
small enough to avoid turning the simulation into an event spammer. Every
generated micro-event is saved, including the ones the centre notice has to
skip at high speed because of the notification rate limit.

## Selection algorithm

For every due day:

1. Build a context from the live state: kingdom, ruler, living residents,
   soldiers, children, elders, dragons, war status, season, weather, named
   buildings and current resources.
2. Reject templates whose gate is not met (no dragon, no child, no soldier, no
   war, and so on).
3. Weight the remaining templates by the **base weight** below, multiplied by
   the situational modifiers:
   - `WAR`: ×2.2 while a neighbour treaty is `war`
   - `DISASTER`: ×1.35 in rain, storm, snow, fog or thunder
   - `NATURE`: ×1.35 in winter
   - `ECONOMY`: ×1.2 when gold < 25 or food < 30
   - `PEOPLE`: ×1.15 when the villager population is above 25
   - `FAITH`: ×1.1 when a temple or shrine exists
   - repeat penalty: ÷`(1 + 2 × appearances in the latest 8 retained events)`
4. Draw once from the deterministic `micro-events` random stream and apply the
   exact effects. The same seed and day count reproduce the same catalogue
   choices, names and text.
5. Append the normalized page, bridge the existing event log, and queue the
   centre notice.

`MICRO_EVENT_TEMPLATES` is the code source of truth; this table mirrors its
ids, base weights, severity and gates.

## Catalogue and base weights

Across all 50 templates the base weights total **67.9**. The unconditional
base share is `weight / 67.9` (for example `knight-foot` 3.24%, `market-haggle`
2.95%, `dragon-village` 1.77%). The chance on a given due day is
`weight × situational multipliers / sum of the available candidates`, so gates
and the repeat penalty move the actual probability. The weights below are the
source values, not a claim that every template has the same chance in every
realm.

Severity: **1** small, **2** notable, **3** great. Effects are applied only for
the listed resources/morale and are clamped to valid bounds.

| id | family | base | sev | gate | material effect |
|---|---|---:|---:|---|---|
| `dragon-village` | Nature | 1.2 | 3 | living dragon | Food −2, Morale −0.6 |
| `dragon-hoard` | Nature | 0.9 | 2 | living dragon | Gold +2 |
| `dragon-shadow` | Omens | 1.0 | 2 | living dragon | Morale −0.3 |
| `dragon-hunger` | Nature | 0.8 | 2 | living dragon | Food −1 |
| `knight-foot` | War | 2.2 | 2 | soldier/guard | Morale −0.2 |
| `sword-rust` | War | 1.6 | 1 | soldier/guard | none |
| `night-watch` | War | 1.8 | 1 | soldier/guard | Morale +0.1 |
| `border-riders` | War | 1.5 | 2 | soldier + war | Morale −0.1 |
| `training-bruise` | War | 1.7 | 1 | soldier/guard | Morale −0.1 |
| `ruler-insomnia` | Court | 1.6 | 1 | always | Morale −0.1 |
| `steward-ledger` | Court | 1.5 | 1 | always | Gold +1 |
| `servant-letter` | Court | 1.4 | 1 | always | none |
| `bard-song` | Court | 1.8 | 1 | always | Morale +0.2 |
| `child-kite` | People | 1.7 | 1 | resident under 16 | Morale +0.2 |
| `birth-cradle` | People | 1.2 | 1 | always | Morale +0.2 |
| `funeral-bell` | People | 1.0 | 2 | always | Morale −0.3 |
| `healer-herb` | People | 1.4 | 1 | always | none |
| `old-soldier-story` | People | 1.2 | 1 | resident 55+ | Morale +0.2 |
| `market-haggle` | Economy | 2.0 | 1 | always | Gold +1 |
| `bakery-burn` | Economy | 1.1 | 2 | always | Food −1 |
| `merchant-road` | Economy | 1.6 | 2 | always | Gold +2 |
| `missing-sheep` | Economy | 1.5 | 1 | always | Food −1 |
| `mill-wheel` | Economy | 1.4 | 1 | always | Wood −1 |
| `coin-clip` | Economy | 1.1 | 2 | always | Gold −1 |
| `harvest-basket` | Economy | 1.8 | 1 | always | Food +2 |
| `storm-roof` | Disaster | 1.4 | 2 | always | Wood −1 |
| `river-flood` | Disaster | 0.8 | 3 | always | Food −1, Wood −1 |
| `lightning-tree` | Nature | 1.5 | 1 | always | Wood +1 |
| `wolf-sheep` | Nature | 1.4 | 2 | always | Food −1 |
| `birds-field` | Nature | 1.8 | 1 | always | Food −1 |
| `spring-bloom` | Nature | 1.7 | 1 | always | Morale +0.2 |
| `earth-tremor` | Disaster | 0.9 | 2 | always | Stone −1 |
| `pilgrim-relic` | Faith | 1.4 | 1 | always | Morale +0.3 |
| `bell-tower` | Faith | 1.5 | 1 | always | Morale +0.2 |
| `heresy-chalk` | Faith | 1.0 | 2 | always | Morale −0.2 |
| `festival-ribbon` | Faith | 1.5 | 1 | always | Food −1, Morale +0.3 |
| `comet` | Omens | 1.2 | 2 | always | Morale −0.2 |
| `ruin-door` | Exploration | 1.0 | 2 | always | Gold +1 |
| `old-map` | Exploration | 1.3 | 1 | always | none |
| `raven` | Omens | 1.5 | 1 | always | Morale −0.1 |
| `lost-road` | Exploration | 1.4 | 1 | always | none |
| `plague-rat` | Disaster | 0.9 | 2 | always | Morale −0.3 |
| `well-water` | People | 1.5 | 1 | always | Morale +0.1 |
| `festival-fire` | Disaster | 0.9 | 2 | always | Wood −1, Morale −0.2 |
| `tax-collector` | Economy | 1.3 | 1 | always | Gold +1 |
| `wandering-scholar` | Exploration | 1.1 | 1 | always | Morale +0.2 |
| `child-fever` | People | 1.0 | 2 | resident under 16 | Morale −0.2 |
| `dog-king` | Court | 1.4 | 1 | always | Morale +0.1 |
| `argument-hall` | Court | 1.5 | 1 | always | Morale −0.1 |
| `quiet-banners` | Court | 1.0 | 1 | always | none |

“Soldier” includes named guards, knights, archers and entities with a military
service record. “Living dragon” means an actual `isDragon` entity with a
creature record. If a gate is missing, that template is excluded rather than
inventing the person or creature.

## Effects and bounds

- Morale is clamped to `0…100`; each event changes it by at most **0.6**.
- Resources are clamped to `>= 0`; a missing stock cannot make the balance
  negative. The page stores the **actual** change after clamping.
- There are no instant-death, conquest or player-choice effects hidden in the
  small-event engine. Existing systems remain responsible for births, deaths,
  raids, succession and major decisions.
- The notice and the page expose the impact. Events with no material change say
  `NO MATERIAL CHANGE · OBSERVED ONLY`.

## Timeline behaviour

Open **MANAGEMENT → CHRONICLE**. The living timeline is above the decision
inbox and legacy record.

- The year rail and `SCRUB THE REIGN` slider only move the reading cursor.
- Selecting a year filters the pages; selecting an event opens its full record.
- `RETURN TO THE PRESENT` moves the cursor to the current year.
- A page shows date, place, named witnesses, impact and source (`SIMULATION
  RECORD` or `PROCEDURAL CHRONICLER`).
- The UI renders at most 160 cards per year for responsiveness; the remaining
  pages are still in the save and are reachable by narrowing the family filter
  or the year.
- **No replay button issues an action.** Pausing/reading never rewinds the
  simulation state; there are no choices in the archive. This is deliberate:
  the user asked to see history again, not to rewrite it.

## Centre notices

`#event-notification` is a non-modal, CK-style parchment card at the top centre.
It shows the family, title, text, date and a `VIEW IN CHRONICLE` button. It has
no decision buttons.

- Maximum queue: 5; oldest queued notice is dropped when the queue is full.
- Minimum gap between notices: 1.4 s; display time: 5.2 s.
- At 4× speed some notices are skipped visually. **The timeline retains all of
  them**, so no history depends on whether a popup was seen.
- Clicking the notice opens the exact page; it does not change the simulation.
- Notices are emitted for procedural micro-events. Existing world events are
  bridged into the timeline but do not create startup popups.
- `clearTimelineNotifications()` resets the queue when starting or loading a
  realm.

## Save and migration

- Timeline state is `state.eventTimeline`: `{events, sequence, totalGenerated,
  nextEventTick}`.
- Schema **11** stores it. Schema 10 saves migrate by adding `eventTimeline =
  null`; normalization turns that into an empty archive. Existing worlds keep
  their people, resources and short event log.
- The timeline is capped at **2,400** events and every text/participant field is
  length-limited. Validation rejects an oversized event list, invalid dates and
  oversized text.
- The event log bridge means a schema-11 save contains existing world events as
  timeline pages as well as procedural micro-events.
- No API key, network call or LLM call is used by this engine. It is a
  deterministic procedural chronicler for performance and reproducibility.
  The optional Atelier AI remains a separate, server-side feature.

## Verification

```bash
node --test tests/systems/micro-events.test.js
npm test
npm run build:runtime
```

The focused test covers schema 11, the 2,400 cap, normalization, deterministic
generation, grounded names/text, the `addLog` bridge, save migration, timeline
rendering, year rewind and the no-command archive. Browser verification on
**2026-11-12** used the built runtime with seed `20261113`: kingdom
**New Realm**, ruler **Wren Longstride**, generated page **THE OLD STONE
SPEAKS** (year 1, day 5, participants Runa Goldleaf and Alwen Kestrel), a
visible centre notice, archive detail, year 1/year 2 navigation, save/reload
with **5 pages before and 5 after**, and a schema-10 save that migrated to
schema 11 with an empty archive. `pageErrors=[]` and `consoleErrors=[]`.
This is not a claim that a live LLM provider was called.
