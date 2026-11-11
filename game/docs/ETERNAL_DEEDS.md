# Eternal deeds and the living chronicle

**Status:** implemented on the `3.11.0` line and verified on 2026-11-10.
**Scope:** repeatable post-ambition goals, HUD continuation, rewards, stall protection, save compatibility and long-run evidence.

## Why this exists

The deterministic 50-year audit exposed the real long-term gap. After the thirteenth royal ambition completed in year 20, the realm had no further goal: it stayed at 70/70 residents, 50 buildings and 67 resolved events with no game over, but there was nothing left to play toward. The authored ladder was finished, not the game.

The thirteen royal ambitions are a finite story; the final year gate now opens at year 20 so the Second Crown era has playable time in the 25-year audit. Eternal deeds are an additive layer that begins only after all thirteen are complete and then continues for as long as the realm exists.

## Goal families

Each deed reads authoritative live state. The baseline is captured when the deed is issued, the target is fixed and saved, and the reward is paid exactly once on completion.

| Deed | Live system | Target at issuance | Reward |
|---|---|---|---|
| The Realm Still Grows | residents | +4 … +12 | food |
| A Roof for Every Soul | housing capacity | +3 … +10 | wood |
| The Builders' Century | completed buildings | +3 … +8 | stone |
| Roads That Outlive the King | road tiles | +6 … +20 | gold |
| A Treasury for the Ages | treasury | ×1.35 or +400 | stone, food |
| A Granary That Never Empties | food stores | ×1.3 or +300 | wood, gold |
| The Contented Crown | morale | at least 88 | gold |
| Every Hearth Content | household satisfaction | at least 75% | food, gold |
| The Listening Throne | resolved realm issues | +6 … +24 | gold |
| The Unending Archive | completed technologies | +1 | gold, stone |
| A Crown Among Crowns | alliances | +1 | gold |
| The Name That Endures | legacy prestige | +25 … +120 | gold, food |
| The Watch That Never Sleeps | soldiers | +2 | gold, food |
| Bells Across the Centuries | temples and shrines | +1 | stone, gold |
| The Long Ledger | completed trades | +8 … +24 | gold |

Every completion also pays prestige. The resource bonus grows with the number of deeds already completed, so the loop remains meaningful without outpacing the authored economy.

## Lifecycle

1. The first eternal deed is issued when the thirteenth ambition completes.
2. `state.ambitions.eternal.active` stores `deedId`, `baseline`, `target`, `startedTick`, `startedYear`, `lastProgressYear`, `bestValue` and `generation`.
3. `updateAmbitions()` evaluates one active deed on the existing 20-tick cadence, after the royal ladder.
4. Completion pays the resources once, awards prestige, writes a bounded legacy/chronicle entry, appends to the twelve-entry history and immediately issues the next deed.
5. A deed that makes no progress for three in-game years is set aside without reward and replaced. This prevents a hard world limit (mobile capacity, map space, a maxed statistic) from blocking the chronicle forever. The set-aside is recorded in the chronicle.
6. Extreme targets are withheld before they can be issued: population below 380, housing below 500, completed buildings below 400, roads below 3,000, soldiers below 120, places of faith below 60. The unbounded families (gold, food, resolved issues, trade, prestige until its cap) keep the rotation alive even in a fully developed realm.

## State and save compatibility

```js
state.ambitions.eternal = {
    count,          // completed eternal deeds
    serial,         // deterministic generation counter
    active,         // issued deed or null
    lastCompleted,  // { deedId, title, year, tick, count }
    history         // newest first, capped at 12
};
```

- `normalizeAmbitions()` adds the eternal state to old saves that do not have it.
- Unknown deed ids, non-finite values, and targets that are not above their baseline are discarded.
- The completed count is capped at 100,000; history is capped at 12 entries.
- The thirteen ambition ids, order, rewards and `allComplete` semantics are unchanged.
- `getAmbitionSnapshot()` still reports `completedCount: 13`, `total: 13` and `allComplete: true`, and adds `eternal`, `eternalCount`, `eternalLabel`, `eternalValue` and `eternalTarget`.
- The HUD keeps the `13 / 13` counter and switches the same card to the blue `ETERNAL DEED · N` presentation with progress and `ETERNAL REWARD`.

## Performance

- No eternal work runs before all thirteen ambitions are complete.
- Evaluation stays on the existing 20-tick ambition cadence; only one deed is active.
- The value functions are bounded reads of entities, statistics, research, diplomacy and legacy. The render path does not rebuild the eternal state or allocate history arrays.
- The 50-year deterministic campaign completed 20,040 ticks in 76.9 s at 3.037 ms/tick, with every existing campaign requirement green. The pre-feature 50-year baseline was 3.038 ms/tick, so the new layer is within run-to-run noise.

## Verification

- Focused ambitions: **12/12**.
- Full suite: **696/696**; syntax and relative imports for 101 source files; 189 referenced UI ids.
- 50-year campaign: `ok:true`, 20,040 ticks, 13/13 ambitions, 3.037 ms/tick, no game over. Eternal deed 1 completed by year 28; stalled deeds were set aside in years 30, 33 and 36; eternal deed 2 completed in year 50.
- Browser 25-year campaign: 13/13, `ETERNAL DEED · 1`, progress and reward visible at 1600×1000, 1024×768 and 864×1000, no page or console errors. The browser audit now fails if the eternal kicker, progress label or reward line is missing.
- Reproduce with `npm test`, `CAMPAIGN_YEARS=50 npm run test:campaign`, and `npm run test:campaign:browser` against a served `E2E_BASE_URL`.
