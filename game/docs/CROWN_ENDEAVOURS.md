# Crown Endeavours — v3.14.0

**Status:** implemented on the `3.14.0` line and verified on 2026-11-10.
**Entry point:** `ENDEAVOURS`, the nineteenth management tab.
**Core:** `js/systems/endeavours.js`; **panel:** `js/presentation/endeavours-panel.js`.

## Why it exists

The v3.11.0 100-year audit and five player journeys all ended in the same place: the thirteen royal ambitions were complete, the eternal-deed card continued to tick, but there was no long-term project that made the court, economy, army, diplomacy and research feed one another. The realm could keep growing, yet the player had no reason to choose one direction over another. Crown Endeavours is the post-ambition layer that turns those systems into five competing, repeatable building programmes.

It is deliberately additive. It does not replace ambitions, eternal deeds, research, trade, faith, justice or the construction menu.

## The five paths

| Path | Fantasy | Works (in unlock order) | Crown Legacy | Main realm effects |
| --- | --- | --- | --- | --- |
| Builder | Leave a city that outlives the crown | Grand Aqueduct, Public Baths, Royal Garden | **The Living City** | Housing, sanitation, food demand, morale, legitimacy |
| Warlord | Make the realm feared and secure | Royal Arsenal, Border Citadel, Campaign Road | **The Unbroken Watch** | Military power, diplomacy, legitimacy |
| Diplomat | Bind the world with words | Royal Chancery, Hall of Summits, Archive of Alliances | **The Concord of Crowns** | Diplomacy, trade, legitimacy |
| Merchant | Turn every road into a ledger | Merchants' Exchange, Caravan Road, Royal Mint | **The Crown Treasury** | Taxes, trade |
| Scholar | Carry the light past the old tree | Royal University, Observatory, Great Archive | **The Eternal Library** | Research, diplomacy, legitimacy |

Each of the three works has five tiers. A tier can be repeated only after the previous tier completes, and a path's later works unlock when the earlier work reaches its first tier. In total there are fifteen repeatable works and seventy-five possible work completions.

## Crown Legacies

Every path ends in exactly one Crown Legacy. A legacy is not a sixth repeatable tier:

- It unlocks only when **all three works in its path are at tier 5** (fifteen completions in that path).
- It costs a large one-time reserve and requires several annual work cycles, using the same named overseer and Thrifty/Steady/Grand funding as the rest of the panel.
- It can be completed once. After completion the card reads **MASTERED** and cannot be started again.
- Its completion adds its permanent modifier, records a **Crown Legacy Complete** chronicle entry, raises morale by 8 and legitimacy by 1.2.
- Completing all five legacies records **The Eternal Crown**, raises morale by 10 and legitimacy by 2, and shows the milestone in the panel summary.

The one-time legacy effects are:

| Legacy | Cost | Work | Permanent effects |
| --- | --- | ---: | --- |
| The Living City | 260 wood · 240 stone · 180 gold | 170 | +8 housing, +5 sanitation, −2% household food demand |
| The Unbroken Watch | 220 wood · 260 stone · 200 gold | 180 | +5% soldier power, +2.2 annual relation, +0.03 legitimacy/year |
| The Concord of Crowns | 180 wood · 160 stone · 300 gold | 180 | +2.5 annual relation, +4% trade terms, +0.03 legitimacy/year |
| The Crown Treasury | 200 stone · 340 gold | 170 | +5% tax yield, +5% trade terms |
| The Eternal Library | 240 wood · 220 stone · 220 gold | 190 | +8% research rate, +0.03 legitimacy/year, +0.8 annual relation |

The existing modifier caps still apply. A capstone can therefore be a meaningful completion goal without allowing a long run to produce runaway values.

## How a work works

- **Real cost.** Starting a work spends wood, stone, gold and sometimes food. The cost scales with the tier.
- **Named overseer.** A living resident must be appointed. The panel lists candidates with competence and conviction; the chosen resident is recorded in the work and in the realm chronicle.
- **Funding.** Thrifty, Steady or Grand changes the annual gold cost and the yearly progress. Funding can be changed while a work is active, but the cost is charged at the next annual audit.
- **Annual progress.** Progress is applied once per year from the simulation, not per frame. A work therefore has a real duration measured in years.
- **Completion.** The work applies a permanent modifier, records a chronicle entry and unlocks the next tier, work or legacy. Legacy completion additionally grants the morale and legitimacy award above.
- **Abandonment.** A work can be abandoned; the invested resources are not refunded. The overseer returns to the civilian pool.
- **Reassignment.** An active work can swap overseer without losing progress, at the cost of a small morale hit.

## Permanent modifiers

Every completed work and legacy contributes to a cached modifier snapshot consumed by the existing systems:

- `health.js` — sanitation and health pressure
- `morale.js` — realm morale
- `economy.js` — taxes and food demand
- `military.js` — soldier power
- `diplomacy.js` — annual relation drift
- `research.js` — research rate (the cache signature includes the modifier total)
- `market.js` — trade factor
- `simulation.js` — annual `updateEndeavours()` cadence

Modifiers are capped so a long run cannot produce runaway values. The panel shows the live totals, including the source work for each effect.

## Late research

The original sixteen technologies were exhausted before the end of a scholar journey. Eight late technologies now extend the same tree:

`deep-plough`, `seed-banks`, `blast-furnace`, `printing-press`, `hospitals`, `vaccination`, `standing-bureaucracy`, `great-charter`.

They use the existing research points, scholar appointments, funding and save schema. The total is now twenty-four technologies. The scholar journey completed seventeen of them in 100 years while also finishing fifteen works, which leaves the rest of the tree as a real long-term target.

## Interface

The nineteenth management tab renders:

- the active work card with progress, years remaining, overseer, funding and abandon/reassign controls;
- five path cards with their works and one legacy each;
- the Crown Legacies count and the Eternal Crown milestone;
- the modifier summary;
- the completion history.

The panel is keyboard-reachable, uses the existing command-modal focus handling and has narrow-width rules. A v3.14.0 browser screenshot exposed that switching from a scrolled management panel to the Endeavours tab preserved the old scroll offset, hiding the panel title and the first paragraph under the tab deck. `render(true)` now resets the content scroll position only when a tab is selected; an action re-render keeps the player's current position.

Browser checks at 1600×1000 and 864×1000 reported no horizontal overflow, five path cards, twenty project cards, one legacy card per path and no console or page errors.

## Save compatibility

`state.endeavours` keeps the same shape: `active`, `completed`, `history` and `lastUpdateYear`. The five legacy ids live in `completed` with a limit of one. On load, `createEndeavoursState()` clamps a legacy completion to one and an active legacy to tier 1; `validateEndeavoursState()` rejects a count above the project's own limit. Unknown projects and malformed active works are still discarded. Saves from before 3.14.0 load with empty legacy entries, and the thirteen ambitions and eternal deeds are untouched. No save-schema bump was required.

## Verification

- Focused Endeavour tests: **10/10**, including legacy unlock, one-time completion, legacy clamping, all-five Eternal Crown and the existing funding/overseer/abandonment paths.
- Full Node suite: **734/734**; syntax and relative imports for **105 source files** and **189 referenced UI ids**.
- Before this additive change, all five 100-year player journeys were green: builder 40,013 ticks / 66 residents / 13 works; warlord 40,011 / 50 / 14 works / 2 battles; diplomat 40,007 / 54 / 14 works / 4 alliances; merchant 40,007 / 42 / 15 works / 240 trades; scholar 40,007 / 86 / 10 works / 17 technologies. Every run had zero page or console errors and no overflow.
- Deterministic 25-year campaign: **`ok:true`**, 10,040 ticks, **0.728 ms/tick**, 13/13 ambitions, no game over.
- Post-change browser journey: **Merchant, 120 years**, 48,008 ticks, **0.622 ms/tick**, 181.8 s wall time, 42 residents, **16/16 works including The Crown Treasury**, **1/5 Crown Legacies**, 288 trades, no game over and no page/console errors. The 1600 px and 864 px layouts each rendered five paths, twenty project cards and their legacy without horizontal overflow; both opened at the panel title with `panelScrollTop: 0`.
- The 120-year run is an extended path test, not a claim that a 1,000-hour human campaign has been completed.

## Known limits

- The browser journeys accelerate the clock internally (400 ticks per year) but perform every realm-changing action through visible controls. They are evidence of UI reachability, not a claim that a human would make the same choices.
- The measured tick costs are host measurements; lower-end devices should be measured separately.
- Crown Endeavours is a management layer, not a new map or a new faction. Its depth comes from the existing systems it modifies. The five legacies close the "no conclusion after mastering a path" gap; they do not by themselves establish a 1,000-hour content guarantee.
