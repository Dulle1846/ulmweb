# Council docket — Kings & Cards 3.75.0

The Government panel now carries a bounded legislative loop over the existing
political factions, treasury and government record. It does not add a second
government system: it reads the same `state.government` and `state.politics`
DTOs that the constitution, tax rate and royal court already use.

## Player loop

1. **Propose** one of four standing bills per year: Bread Ordinance, Guild
   Charter, March Levy or Temple Relief. Each bill names its real supporters and
   opponents among commons, nobility, guilds and clergy, and shows its lobby
   cost. Starting support is derived from those faction standings and the
   current `councilSeats`.
2. **Lobby** once per year by paying the declared gold/food/wood through the
   royal stores and goods ledger. Payment raises support by two plus the number
   of council seats, and marks the bill `lobbied`.
3. **Vote** from the following year, either with the visible CALL VOTE button or
   in the bounded annual council session. The vote reads one draw from the
   dedicated `"council"` random stream, applies a `-4…+4` swing and compares
   support with the bill threshold.
4. **Enforcement** is real: an enacted bill applies its political effects,
   changes morale, increments `government.decrees` and writes a `council-law`
   row to the existing 40-row government history. A rejected bill applies a
   smaller faction scar and stays in the bounded 24-row council record.

## Bounds and compatibility

- At most three docket rows and twenty-four council records. Government history
  remains capped at forty rows. One proposal, one lobby and one crown vote per
  year; the annual pass settles each ready bill at most once.
- `state.government.council` is optional and normalized on load. Legacy saves
  receive an empty bounded docket without a schema bump. Import validation
  rejects malformed or oversized council DTOs.
- Only the annual pass runs automatically: one bounded vote per lobbied bill,
  with no per-tick work, no unit pathfinding and no new render scale or FPS
  budget.
- The `"council"` stream is independent. Combat, court, campaign, simulation
  and every older RNG counter keep their exact draw order.

## Tests and evidence

- `tests/systems/council-laws.test.js` — normalization, guards, real ledger
  costs, enacted/rejected effects, annual reconciliation, RNG isolation,
  snapshots and save DTO normalization.
- `tests/browser/council-docket-ui.mjs` — real browser propose → lobby → next
  year → vote → annual session → save/load, with zero page and console errors.
- Spec point `3.9.9`, generated into `docs/SPEC_COVERAGE_AUDIT.md`,
  `docs/spec-coverage.json` and `js/generated/spec-coverage.js`.
