# Crafted item uses

A smithy or scriptorium still records at most one unique item per season. Those
records are now more than catalogue entries: an owned item can be committed to
one active use or sold to a buyer from its Lexicon dossier.

## What a player sees

- In `LEXICON → PLAYER-MADE`, open any owned record. Its dossier shows
  `STATUS OWNED` and two explicit buttons: one active use and one sale. Each
  button names the payout, for example `ISSUE TO THE HUNT · +5 FOOD` or
  `SELL TO AN ARMS DEALER · +8 GOLD`.
- Clicking a button pays immediately through the royal resource ledger, writes
  one event to the chronicle and a short confirmation line under the Lexicon.
  The row badge changes from `OWNED` to `USED` or `SOLD`, and the buttons are
  gone. A record can be committed exactly once.
- Legacies from earlier saves have no status field. They open as `OWNED` and can
  be used normally; no migration or save-schema bump is needed.
- The payout is fixed by the recorded quality and the declared bounds for that
  kind. The same record always offers the same two numbers, before and after a
  reload. No dice are rolled.

## Simulation contract

- `CRAFTED_ITEM_USES` in `js/systems/city-config.js` declares two options for
  each of the six crafted kinds (`weapon`, `armour`, `tool`, `book`, `jewellery`,
  `relic`): `use` and `sell`, each with a target status, a royal resource and
  integer `minimum`/`maximum` bounds.
- `craftedUseAmount(option, quality)` derives the payout as
  `minimum + round(quality / 100 × (maximum − minimum))`. It is pure and
  bounded; quality is clamped to `0…100`.
- `useCraftedItem(id, use)` in `js/systems/craft-production.js` is the single
  write path. It resolves one archive record, rejects unknown ids, unknown uses
  and already-committed items without side effects, re-normalizes the archive
  through `normalizeCraftedItems()`, calls `addResource()` once and `addLog()`
  once, and increments `economy.crafting.itemsUsed` or `itemsSold`.
- `status` is part of `normalizeCraftedItem()` with the default `owned`. It is
  saved and restored by the existing `craftedItems` snapshot path, so the
  archive stays capped at `MAX_CRAFTED_ITEMS = 500` and frozen on read.
- Nothing here changes `CRAFT_INTERVAL = 90`, `CRAFT_SUPPLY_INTERVAL = 30`,
  `CRAFT_SUPPLY_TARGET = 8`, the deterministic craft ids, the RNG streams or any
  per-tick work. Committing an item is a player action only.
- `craftedKey()` in the Lexicon panel includes every record's status, so a
  committed item repaints immediately even when the archive length and its last
  id are unchanged.

## Proofs

- `tests/systems/item-lexicon.test.js`: legacy status default, normalization,
  save roundtrip, declared two-option uses, quality bounds, determinism.
- `tests/systems/craft-production.test.js`: a forged weapon pays food once and
  records `used`; a written book pays gold once and records `sold`; unknown ids
  and uses are refused; repeated calls pay nothing; cadence and cap unchanged.
- `tests/browser/crafted-item-uses.mjs`: real start screen, HUD, workshop,
  Lexicon panel navigation, two produced unique items, real button clicks,
  status/resource checks, a save/restore roundtrip and zero page/console errors.
