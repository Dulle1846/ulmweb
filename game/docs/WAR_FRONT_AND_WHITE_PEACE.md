# War front and white peace — v3.12.0

**Status:** implemented and verified on the `3.12.0` line, 2026-11-10.
**Core:** `js/systems/military.js`, `js/systems/diplomacy.js`; **UI:** `js/presentation/management-ui.js`.

## The dead end the warlord journey found

The 100-year warlord journey could declare war from the DIPLOMACY panel, recruit and drill a named garrison, and pay its annual muster. It still produced this result:

- 0 recorded battles for decades;
- the war remained a treaty flag, so the army never met an enemy;
- food fell to 0 while the garrison ate, but `SUE FOR PEACE` required 20 gold **and 15 food**;
- the realm could not buy peace because it had no food, so the war continued for 70 years;
- 20 soldiers deserted and the warlord ended with a tiny garrison despite a large treasury.

That is a real hard block, not a UI bug: the player had no battle decision and no exit once the war economy collapsed.

## The war front

While any neighbouring realm is at war, the annual military update now opens a border front:

- at most once per year (`lastWarRaidYear`);
- only while no raid is already active;
- two `TYPE.TROLL` raiders spawn 12–19 tiles from the keep;
- the existing `updateCombat()` resolves the fight with the real named garrison, towers and keep;
- soldiers gain battle marks, wounds, kills, losses and personal memories through the existing combat record;
- `state.raidActive` stays true until the enemies are dead, so fronts cannot stack without bound;
- the annual payroll still runs first, so food and gold shortages have real consequences.

The spawn is capped by the existing entity limits. It does not add a per-tick search or a second combat loop.

## White peace

War exhaustion rises by 2 per year during war. At **35 exhaustion**, the peace action becomes a **white peace**:

- it costs no gold and no food;
- it still requires the realm to be at war;
- it resets the treaty, writes a `peace` history entry and a chronicle entry;
- the DIPLOMACY panel shows `SUE FOR WHITE PEACE` and enables the action even at 0 gold / 0 food.

Below 35 exhaustion the original paid peace terms remain. This preserves the cost of an early exit while ensuring a losing war can always end.

## Save compatibility

`state.military.lastWarRaidYear` is additive. `normalizeMilitaryState()` defaults it to 0 for old saves and clamps malformed values. `state.diplomacy` already normalizes war exhaustion; old saves keep their treaties and gain white peace without migration.

## Verification

- Focused diplomacy/military/Endeavour/research tests: **32/32**.
- Full suite: **705/705**; syntax and relative imports for 103 source files and 189 UI ids.
- White-peace regression: a war realm at exhaustion 40 with 0 gold and 0 food concludes peace and spends nothing.
- Warlord 100-year browser journey: war declared in year 31, **3 battles on the surviving roster (23–33 cumulative battle marks during the war), 9 losses, 15 desertions, white peace in year 71**, 28 residents, 44 buildings, 15 Endeavours, no page or console errors, desktop/narrow screenshots without overflow, **2.909 ms/tick**.
- The deterministic 100-year campaign remains green; it does not declare war, so the new front does not alter its path.

## Known limits

- The war front is an abstract border pressure, not a tactical battle map. It reuses the existing real-time combat and named-soldier records.
- Two trolls per year is deliberately bounded; a larger war would need a dedicated campaign layer rather than more per-tick entities.
- The 100-year measurements are Node/browser measurements on this host, not a low-end-device benchmark.
